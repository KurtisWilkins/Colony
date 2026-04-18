#ifndef PORTAL_HTML_H
#define PORTAL_HTML_H

#include <Arduino.h>

// Captive portal HTML stored in program memory (PROGMEM).
// This eliminates the need for LittleFS upload — the portal works
// immediately after flashing via Arduino IDE or PlatformIO.

const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Irrigation S2 Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0d0d;color:#00ff41;font-family:'Courier New',monospace;padding:16px;max-width:600px;margin:0 auto;font-size:14px}
h1{text-align:center;margin:20px 0;font-size:22px;color:#00ff41;text-shadow:0 0 10px rgba(0,255,65,0.5)}
h2{color:#00cc33;font-size:16px;margin:20px 0 12px 0;padding-bottom:6px;border-bottom:1px solid #1a3a1a}
.subtitle{text-align:center;color:#339933;font-size:12px;margin-bottom:24px}
.ascii{text-align:center;color:#00aa33;font-size:10px;line-height:1.2;margin-bottom:16px;white-space:pre}
form{display:flex;flex-direction:column;gap:6px}
.field{display:flex;flex-direction:column;margin-bottom:10px}
label{color:#00cc33;font-size:12px;margin-bottom:3px}
input,select{background:#111;border:1px solid #1a3a1a;color:#00ff41;padding:8px 10px;font-family:'Courier New',monospace;font-size:14px;border-radius:3px;width:100%}
input:focus,select:focus{outline:none;border-color:#00ff41;box-shadow:0 0 5px rgba(0,255,65,0.3)}
input::placeholder{color:#1a5a1a}
.desc{color:#336633;font-size:11px;margin-top:2px}
.row{display:flex;gap:10px}
.row .field{flex:1}
button{background:#003300;color:#00ff41;border:1px solid #00ff41;padding:12px;font-family:'Courier New',monospace;font-size:14px;cursor:pointer;border-radius:3px;margin-top:8px;text-transform:uppercase;letter-spacing:1px}
button:hover{background:#004400;box-shadow:0 0 10px rgba(0,255,65,0.3)}
button:active{background:#005500}
.scan-btn{margin-bottom:8px;padding:8px;font-size:12px}
.btn-danger{border-color:#ff4444;color:#ff4444;background:#330000}
.btn-danger:hover{background:#440000;box-shadow:0 0 10px rgba(255,68,68,0.3)}
#status{text-align:center;padding:16px;margin:16px 0;display:none;border:1px solid #00ff41;border-radius:3px;background:#001a00}
.networks{max-height:150px;overflow-y:auto;border:1px solid #1a3a1a;border-radius:3px;margin-bottom:8px;display:none}
.net-item{padding:6px 10px;cursor:pointer;display:flex;justify-content:space-between;border-bottom:1px solid #0a1a0a}
.net-item:hover{background:#0a2a0a}
.net-item:last-child{border-bottom:none}
.net-rssi{color:#336633;font-size:11px}
.section{background:#0a0a0a;border:1px solid #1a2a1a;border-radius:4px;padding:14px;margin-bottom:12px}
.version{text-align:center;color:#1a3a1a;font-size:11px;margin-top:20px;padding-top:10px;border-top:1px solid #0a1a0a}
.usb-note{text-align:center;color:#336633;font-size:11px;margin-bottom:8px}
select option{background:#111;color:#00ff41}
</style>
</head>
<body>

<div class="ascii">
 ___  ____  ____  ___  ___    __   ____  ___  _____  _  _
(  _)(  _ \(  _ \(  _)/ __)  /__\ (_  _)(  _)(  _  )( \( )
 )(   )   / )   / )(( (_ \ /(__)\ _)(_  )(   )(_)(  )  (
(___)(__)\_)(__\_)(___)\___/(__)(__)(____)(___)(_____)(__)\_)
                    ____  ____
                   / ___)(___ \
                   \___ \ / __/
                   (____/(____)
</div>

<h1>&gt; Irrigation S2 Setup_</h1>
<p class="subtitle">Olimex ESP32-S2-DevKit-Lipo — 16-Zone Controller — Colony Platform</p>
<p class="usb-note">Native USB — no COM driver required.</p>

<form id="configForm" method="POST" action="/save">

<div class="section">
<h2>// Network</h2>
<button type="button" class="scan-btn" onclick="scanWifi()">Scan WiFi Networks</button>
<div id="networkList" class="networks"></div>
<div class="field">
  <label for="wifi_ssid">WiFi SSID</label>
  <input type="text" id="wifi_ssid" name="wifi_ssid" placeholder="your-network-name" list="ssidList" required>
  <datalist id="ssidList"></datalist>
</div>
<div class="field">
  <label for="wifi_pass">WiFi Password</label>
  <input type="password" id="wifi_pass" name="wifi_pass" placeholder="network-password">
</div>
</div>

<div class="section">
<h2>// MQTT Broker</h2>
<div class="row">
  <div class="field">
    <label for="mqtt_host">Host / IP</label>
    <input type="text" id="mqtt_host" name="mqtt_host" placeholder="192.168.1.100">
  </div>
  <div class="field" style="max-width:100px">
    <label for="mqtt_port">Port</label>
    <input type="number" id="mqtt_port" name="mqtt_port" placeholder="1883">
  </div>
</div>
<div class="row">
  <div class="field">
    <label for="mqtt_user">Username</label>
    <input type="text" id="mqtt_user" name="mqtt_user" placeholder="(optional)">
  </div>
  <div class="field">
    <label for="mqtt_pass">Password</label>
    <input type="password" id="mqtt_pass" name="mqtt_pass" placeholder="(optional)">
  </div>
</div>
</div>

<div class="section">
<h2>// Device Identity</h2>
<p class="desc">MQTT topic path: facility/building/unit/device_name</p>
<div class="row">
  <div class="field">
    <label for="facility">Facility</label>
    <input type="text" id="facility" name="facility" placeholder="farm">
  </div>
  <div class="field">
    <label for="building">Building</label>
    <input type="text" id="building" name="building" placeholder="field1">
  </div>
</div>
<div class="row">
  <div class="field">
    <label for="unit">Unit</label>
    <input type="text" id="unit" name="unit" placeholder="zone-bank1">
  </div>
  <div class="field">
    <label for="device_name">Device Name</label>
    <input type="text" id="device_name" name="device_name" placeholder="irrigation1">
  </div>
</div>
</div>

<div class="section">
<h2>// Timezone</h2>
<div class="field">
  <label for="timezone">Timezone (POSIX TZ)</label>
  <select id="timezone" name="timezone">
    <option value="EST5EDT,M3.2.0,M11.1.0">Eastern (EST/EDT)</option>
    <option value="CST6CDT,M3.2.0,M11.1.0">Central (CST/CDT)</option>
    <option value="MST7MDT,M3.2.0,M11.1.0">Mountain (MST/MDT)</option>
    <option value="PST8PDT,M3.2.0,M11.1.0">Pacific (PST/PDT)</option>
    <option value="MST7">Arizona (MST, no DST)</option>
    <option value="AKST9AKDT,M3.2.0,M11.1.0">Alaska (AKST/AKDT)</option>
    <option value="HST10">Hawaii (HST, no DST)</option>
    <option value="GMT0BST,M3.5.0/1,M10.5.0">UK (GMT/BST)</option>
    <option value="CET-1CEST,M3.5.0,M10.5.0/3">Central Europe (CET/CEST)</option>
    <option value="AEST-10AEDT,M10.1.0,M4.1.0/3">Australia Eastern (AEST/AEDT)</option>
    <option value="NZST-12NZDT,M9.5.0,M4.1.0/3">New Zealand (NZST/NZDT)</option>
    <option value="UTC0">UTC (no DST)</option>
  </select>
  <span class="desc">Used for schedule evaluation and NTP time display</span>
</div>
</div>

<div class="section">
<h2>// Zone Configuration</h2>
<div class="field">
  <label for="zone_count">Active Zone Count</label>
  <input type="number" id="zone_count" name="zone_count" placeholder="16" min="1" max="16">
  <span class="desc">How many of the 16 relay channels are wired (1-16)</span>
</div>
</div>

<div class="section">
<h2>// Safety Limits</h2>
<div class="row">
  <div class="field">
    <label for="safety_max_runtime">Max Single Run (seconds)</label>
    <input type="number" id="safety_max_runtime" name="safety_max_runtime" placeholder="1800">
    <span class="desc">Auto-close valve after this many seconds (default 1800 = 30 min)</span>
  </div>
  <div class="field">
    <label for="safety_max_daily">Max Daily Total (seconds)</label>
    <input type="number" id="safety_max_daily" name="safety_max_daily" placeholder="7200">
    <span class="desc">Max total per-zone runtime per day (default 7200 = 2 hr)</span>
  </div>
</div>
</div>

<button type="submit">Save &amp; Reboot</button>
</form>

<form method="POST" action="/reset" style="margin-top:12px">
  <button type="submit" class="btn-danger">Clear WiFi &amp; Reboot</button>
</form>

<div id="status"></div>

<p class="version">Irrigation S2 Controller v1.0.0 — Olimex ESP32-S2-DevKit-Lipo — Colony Platform</p>

<script>
function scanWifi(){
  var btn=document.querySelector('.scan-btn');
  var list=document.getElementById('networkList');
  var datalist=document.getElementById('ssidList');
  btn.textContent='Scanning...';
  btn.disabled=true;
  list.style.display='none';
  list.innerHTML='';
  datalist.innerHTML='';

  fetch('/scan')
    .then(function(r){return r.json()})
    .then(function(data){
      btn.textContent='Scan WiFi Networks';
      btn.disabled=false;
      if(!data.networks||data.networks.length===0){
        list.innerHTML='<div class="net-item">No networks found</div>';
        list.style.display='block';
        return;
      }
      var seen={};
      data.networks.forEach(function(n){
        if(seen[n.ssid])return;
        seen[n.ssid]=true;
        var opt=document.createElement('option');
        opt.value=n.ssid;
        datalist.appendChild(opt);

        var div=document.createElement('div');
        div.className='net-item';
        div.onclick=function(){
          document.getElementById('wifi_ssid').value=n.ssid;
          document.getElementById('wifi_pass').focus();
        };
        var nameSpan=document.createElement('span');
        nameSpan.textContent=n.ssid;
        div.appendChild(nameSpan);
        var infoSpan=document.createElement('span');
        var lock=n.secure?'[lock] ':'';
        infoSpan.className='net-rssi';
        infoSpan.textContent=lock+n.rssi+'dBm';
        div.appendChild(infoSpan);
        list.appendChild(div);
      });
      list.style.display='block';
    })
    .catch(function(e){
      btn.textContent='Scan WiFi Networks';
      btn.disabled=false;
      list.innerHTML='<div class="net-item">Scan failed: '+e.message+'</div>';
      list.style.display='block';
    });
}

document.getElementById('configForm').addEventListener('submit',function(e){
  e.preventDefault();
  var form=this;
  var status=document.getElementById('status');
  var formData=new FormData(form);

  fetch('/save',{method:'POST',body:new URLSearchParams(formData)})
    .then(function(r){
      if(r.ok){
        status.textContent='Irrigation S2 controller configured. Rebooting...';
        status.style.display='block';
        status.style.borderColor='#00ff41';
        status.style.color='#00ff41';
        form.querySelector('button[type=submit]').disabled=true;
      } else {
        throw new Error('Save failed (HTTP '+r.status+')');
      }
    })
    .catch(function(e){
      status.textContent='Error: '+e.message;
      status.style.display='block';
      status.style.borderColor='#ff4444';
      status.style.color='#ff4444';
    });
});
</script>

</body>
</html>)rawliteral";

#endif // PORTAL_HTML_H
