# NETWATCH 404 — Network Analytics (v2.2 RC)

Panel local de análisis de red para **Windows 10/11** con interfaz web, servidor Python y recolector PowerShell 5.1+. 

1. Descomprime el ZIP, manteniendo su estructura. Necesitas Python 3 y Windows PowerShell 5.1+.
2. Ejecuta `INICIAR_NETWATCH.bat`. Abre `http://127.0.0.1:8765`.
3. Pulsa **Actualizar diagnóstico** para observar interfaces, gateways, vecinos, estadísticas y conexiones *del propio equipo*.
4. **Explorar mi subred** hace ping únicamente a direcciones privadas de la subred directamente conectada que selecciones, limitada a prefijos /24–/30. Úsalo exclusivamente en redes propias o autorizadas.
5. En **Mapa profesional**, navega por todos los dispositivos observados, filtrados por interfaz. Es una agrupación visual, NO una topología física.
6. **Comparar con router** importa CSV/JSON, en el navegador, sin acceder a la contraseña del router.
7. **Monitor local** almacena capturas pasivas mientras `server.py` permanezca ejecutándose; no instala servicios de Windows.

## Pruebas

En Windows: `PRUEBAS_WINDOWS.bat`. La ejecución real de PowerShell, las interacciones del navegador y la experiencia en resoluciones distintas **deben validarse en un Windows real antes de etiquetar Stable**.

En CI Linux se comprueban API/seguridad, validación, comparación, mapa y monitor con datos simulados. No verifica redes Windows.

## Publicación GitHub

Consulta `GITHUB_PUBLICACION.md` y `AUDITORIA_FINAL.md`. Publica código fuente en GitHub y entrega el ZIP en GitHub Releases. **GitHub Pages no ejecuta Python ni PowerShell**, por lo que no representa una versión funcional del diagnóstico. Nunca publiques el directorio `data/` ni informes con IP, MAC o procesos reales.

## Limitaciones y privacidad

- ICMP/ARP puede omitir teléfonos, impresoras, equipos detrás de VLAN o clientes Wi-Fi aislados. Ausencia de respuesta NO equivale a estar desconectado.
- Las estadísticas por adaptador son acumuladas; las velocidades requieren dos muestras comparables.
- El mapa es ilustrativo, sin prueba de cableado o conexiones entre equipos.
- El servidor escucha solo en `127.0.0.1:8765`; datos y registros locales pueden contener IP, MAC y procesos y se guardan en claro. Otros procesos del mismo equipo podrían consultar la API local. No lo expongas mediante túneles.
- No requiere CDN ni librerías Python externas para funcionar. Playwright y Node.js son opcionales para pruebas.
