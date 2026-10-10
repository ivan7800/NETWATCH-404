# NETWATCH 404 — recopilación SOLO LECTURA. Windows PowerShell 5.1+
param([switch]$Discover, [string]$InterfaceAlias = "")
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$folder = Join-Path $base 'data'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
try {
  $interfaces = @(Get-NetIPConfiguration | Where-Object { $_.IPv4Address } | ForEach-Object {
    [pscustomobject]@{ name = $_.InterfaceAlias; prefix = [int]$_.IPv4Address[0].PrefixLength; ip = [string]$_.IPv4Address[0].IPAddress; gateway = if ($_.IPv4DefaultGateway) { [string]$_.IPv4DefaultGateway.NextHop } else { '' }; dns = @($_.DNSServer.ServerAddresses | Where-Object { $_ }) }
  })
  $scanInfo = [ordered]@{ requested = [bool]$Discover; scope = ''; interface = ''; tested = 0; replies = 0; arp = 0; explanation = '' }
  $responders = @{}
  $scanAlias = ''
  if ($Discover) {
    # Only the first connected IPv4 LAN with a gateway, /24 to /30. No arbitrary ranges.
    # Choose the interface Windows prefers for its default IPv4 route, not the
    # arbitrary first interface (which could belong to a VPN or VM adapter).
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric, InterfaceMetric)
    $configs = @(Get-NetIPConfiguration | Where-Object {
      $_.IPv4DefaultGateway -and $_.IPv4Address -and $_.IPv4Address[0].IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
    })
    $candidate = @()
    foreach ($route in $routes) {
      $chosen = @($configs | Where-Object { $_.InterfaceIndex -eq $route.InterfaceIndex } | Select-Object -First 1)
      if ($chosen.Count) { $candidate = $chosen; break }
    }
    if ($InterfaceAlias) {
      $candidate = @($configs | Where-Object { $_.InterfaceAlias -ceq $InterfaceAlias } | Select-Object -First 1)
      if (-not $candidate.Count) { throw 'La interfaz solicitada no existe o no es una interfaz IPv4 privada con gateway.' }
    } elseif (-not $candidate.Count) { $candidate = @($configs | Select-Object -First 1) }
    if ($candidate.Count) {
      $localIP = [string]$candidate[0].IPv4Address[0].IPAddress
      $scanAlias = [string]$candidate[0].InterfaceAlias
      $scanInfo.interface = $scanAlias
      $octets = $localIP.Split('.')
      $prefix = [int]$candidate[0].IPv4Address[0].PrefixLength
      if ($octets.Count -eq 4 -and $prefix -ge 24 -and $prefix -le 30) {
        $mask = 256 - [math]::Pow(2, 32-$prefix)
        $networkLast = ([int]$octets[3] -band [int]$mask)
        $broadcastLast = $networkLast + [int][math]::Pow(2,32-$prefix) - 1
        $baseIP = ($octets[0..2] -join '.')
        $scanInfo.scope = "$baseIP.$networkLast/$prefix ($scanAlias)"
        # Bounded ICMP batches (16 concurrent requests, 250ms timeout each).
        # No port scan, no arbitrary target, no background worker.
        $targets = New-Object 'System.Collections.Generic.List[string]'
        for ($n = ($networkLast+1); $n -lt $broadcastLast; $n++) {
          $dest = "$baseIP.$n"
          if ($dest -ne $localIP) { [void]$targets.Add($dest) }
        }
        for ($start = 0; $start -lt $targets.Count; $start += 16) {
          $pending = New-Object System.Collections.ArrayList
          $last = [math]::Min($start+15, $targets.Count-1)
          for ($i=$start; $i -le $last; $i++) {
            $dest = $targets[$i]
            $scanInfo.tested++
            $pinger = New-Object System.Net.NetworkInformation.Ping
            try {
              $task = $pinger.SendPingAsync($dest, 250)
              [void]$pending.Add([pscustomobject]@{ ip=$dest; ping=$pinger; task=$task })
            } catch { $pinger.Dispose() }
          }
          if ($pending.Count) {
            $tasks = @($pending | ForEach-Object { $_.task })
            try { [void][System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]$tasks, 1500) } catch {}
            foreach ($entry in $pending) {
              try {
                if ($entry.task.IsCompleted -and -not $entry.task.IsFaulted -and -not $entry.task.IsCanceled -and
                    $entry.task.Result.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
                  $scanInfo.replies++
                  $responders[$entry.ip] = $true
                }
              } catch {} finally { $entry.ping.Dispose() }
            }
          }
        }
        $scanInfo.explanation = 'Interfaz seleccionada manualmente o por ruta preferente de Windows. ICMP por lotes de 16, limitado a la subred privada local y caché ARP/ND de Windows. Las respuestas ICMP se incluyen aunque Windows no proporcione MAC. No identifica todos los equipos.'
      } else { $scanInfo.explanation = 'Exploración omitida: se admiten prefijos IPv4 entre /24 y /30.' }
    } else { $scanInfo.explanation = 'No se encontró una interfaz privada IPv4 con gateway válida. No se exploró otra red.' }
  }
  $neighbors = @(Get-NetNeighbor -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
    $_.IPAddress -and $_.IPAddress -match '^\d{1,3}(\.\d{1,3}){3}$' -and
    [int]($_.IPAddress.Split('.')[0]) -lt 224 -and
    $_.IPAddress -ne '0.0.0.0' -and $_.IPAddress -ne '255.255.255.255' -and
    $_.IPAddress -notmatch '^(127|169\.254)\.' -and
    $_.State -notin @('Unreachable','Invalid','Permanent')
  } | Sort-Object IPAddress, InterfaceAlias -Unique | ForEach-Object {
    [pscustomobject]@{ ip = [string]$_.IPAddress; mac = [string]$_.LinkLayerAddress; state = [string]$_.State; interface = [string]$_.InterfaceAlias }
  })
  $deviceList = New-Object System.Collections.ArrayList
  foreach ($neighbor in $neighbors) {
    if ($neighbor.mac -and $neighbor.mac -match '^(00-00-00-00-00-00|ff-ff-ff-ff-ff-ff)$') { continue }
    # Keep legitimate empty MAC entries if an ICMP response was observed.
    if (-not $neighbor.mac -and -not $responders.ContainsKey($neighbor.ip)) { continue }
    $isResponder = ($Discover -and $responders.ContainsKey($neighbor.ip))
    [void]$deviceList.Add([pscustomobject]@{ ip=$neighbor.ip; mac=$neighbor.mac; state=$neighbor.state; interface=$neighbor.interface; source=$(if ($isResponder) {'ICMP + ARP'} else {'Caché Windows'}); respondsToPing=$isResponder; hostname='' })
  }
  if ($Discover) {
    foreach ($address in $responders.Keys) {
      if (-not @($deviceList | Where-Object { $_.ip -eq $address -and $_.interface -eq $scanAlias }).Count) {
        [void]$deviceList.Add([pscustomobject]@{ ip=$address; mac=''; state='Responde'; interface=$scanAlias; source='ICMP'; respondsToPing=$true; hostname='' })
      }
    }
    $scanInfo.arp = @($deviceList | Where-Object { $_.mac }).Count
    # Reverse DNS is best-effort, with a strict per-host deadline and maximum lookups.
    $checkedNames = 0
    foreach ($device in $deviceList) {
      if ($checkedNames -ge 35) { break }
      if (-not $device.respondsToPing) { continue }
      $checkedNames++
      try {
        $pending = [System.Net.Dns]::BeginGetHostEntry($device.ip,$null,$null)
        if ($pending.AsyncWaitHandle.WaitOne(140)) {
          $entry = [System.Net.Dns]::EndGetHostEntry($pending)
          if ($entry.HostName -and $entry.HostName -ne $device.ip) { $device.hostname = [string]$entry.HostName }
        }
      } catch { }
    }
  }
  $devices = @($deviceList | Select-Object -First 254)
  $gateways = @($interfaces | Where-Object gateway | Select-Object -ExpandProperty gateway -Unique)
  $tests = @($gateways | ForEach-Object {
    $address = $_
    $reachable = $false
    $latencyMs = $null
    try {
      $reply = @(Test-Connection -ComputerName $address -Count 1 -ErrorAction Stop | Select-Object -First 1)
      $reachable = $reply.Count -gt 0
      if ($reachable -and $null -ne $reply[0].ResponseTime) { $latencyMs = [int]$reply[0].ResponseTime }
    } catch {}
    [pscustomobject]@{ ip = $address; reachable = $reachable; latencyMs = $latencyMs }
  })
  # Métricas locales SOLO LECTURA; no inspección de paquetes ni barrido de puertos.
  $traffic = @()
  try {
    $traffic = @(Get-NetAdapterStatistics -ErrorAction Stop | ForEach-Object {
      [pscustomobject]@{ name = [string]$_.Name; receivedBytes = [long]$_.ReceivedBytes; sentBytes = [long]$_.SentBytes; receivedErrors = [long]$_.ReceivedPacketErrors; sentErrors = [long]$_.OutboundPacketErrors }
    })
  } catch { $traffic = @() }
  $connections = @()
  try {
    $connections = @(Get-NetTCPConnection -ErrorAction Stop | Where-Object { $_.State -eq 'Established' } | Select-Object -First 250 | ForEach-Object {
      $name = ''
      try { $name = [string](Get-Process -Id $_.OwningProcess -ErrorAction Stop).ProcessName } catch { $name = '(no disponible)' }
      [pscustomobject]@{ protocol = 'TCP'; local = ([string]$_.LocalAddress + ':' + [string]$_.LocalPort); remote = ([string]$_.RemoteAddress + ':' + [string]$_.RemotePort); state = [string]$_.State; pid = [int]$_.OwningProcess; process = $name }
    })
  } catch { $connections = @() }
  $payload = [ordered]@{ mode='live'; collectedAt=(Get-Date).ToUniversalTime().ToString('o'); computer=$env:COMPUTERNAME; interfaces=$interfaces; devices=$devices; gateways=$tests; traffic=$traffic; connections=$connections; scan=$scanInfo; notes='Inventario parcial: combina vecinos Windows y respuestas ICMP durante exploraciones solicitadas. Algunos dispositivos no responden a ICMP o no son visibles desde este segmento.' }
  $json = ConvertTo-Json -InputObject $payload -Depth 6
  $temp = Join-Path $folder ('status.'+[guid]::NewGuid().ToString('N')+'.tmp')
  [System.IO.File]::WriteAllText($temp,$json,(New-Object System.Text.UTF8Encoding $false))
  Move-Item -Path $temp -Destination (Join-Path $folder 'status.json') -Force
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
