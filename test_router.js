const assert=require('node:assert/strict');const r=require('./router_compare.js');
const imported=r.parse('IP;MAC;Nombre\n192.168.1.10;AA:BB:CC:DD:EE:01;Portátil\n192.168.1.11;;Impresora');assert.equal(imported.length,2);
assert.equal(r.parse(JSON.stringify({devices:[{ip:'192.168.0.9',mac:'aa-bb-cc-dd-ee-ff',hostname:'test'}]})).length,1);
assert.throws(()=>r.parse('no es un CSV'));assert.throws(()=>r.parse('IP;Nombre\n999.999.9.9;no'));
const found=[{ip:'192.168.1.12',mac:'AA-BB-CC-DD-EE-01'},{ip:'192.168.1.11',mac:''},{ip:'192.168.1.50',mac:'10:20:30:40:50:60'}];const rows=r.compare(imported,found);assert.equal(rows[0].status,'Coincide MAC');assert.equal(rows[0].observedIp,'192.168.1.12');assert.equal(rows[1].status,'Coincide IP');assert.equal(rows[2].status,'Solo NETWATCH');
const changed=r.compare([{ip:'10.0.0.1',mac:'AA:AA:AA:AA:AA:AA'}],[{ip:'10.0.0.1',mac:'BB:BB:BB:BB:BB:BB'}]);assert.equal(changed[0].status,'MAC distinta');
console.log('6 pruebas de importación y comparación: OK');
