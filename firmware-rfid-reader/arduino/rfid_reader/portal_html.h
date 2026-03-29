#ifndef PORTAL_HTML_H
#define PORTAL_HTML_H

const char PORTAL_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RFID Reader Setup</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0a0a0a;
    color: #00ff41;
    font-family: 'Courier New', monospace;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }
  .container {
    background: #111;
    border: 1px solid #00ff41;
    border-radius: 4px;
    padding: 30px;
    max-width: 460px;
    width: 100%;
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.1);
  }
  h1 {
    text-align: center;
    font-size: 18px;
    margin-bottom: 6px;
    text-shadow: 0 0 10px rgba(0, 255, 65, 0.5);
  }
  .subtitle {
    text-align: center;
    font-size: 11px;
    color: #009926;
    margin-bottom: 24px;
  }
  .prompt::before { content: '> '; color: #009926; }
  label {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
    color: #00cc33;
  }
  input, select {
    width: 100%;
    padding: 8px 10px;
    margin-bottom: 16px;
    background: #0a0a0a;
    border: 1px solid #00802b;
    color: #00ff41;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    border-radius: 2px;
    outline: none;
  }
  input:focus, select:focus {
    border-color: #00ff41;
    box-shadow: 0 0 6px rgba(0, 255, 65, 0.3);
  }
  input::placeholder { color: #005516; }
  .btn-row { display: flex; gap: 10px; margin-top: 4px; }
  button {
    flex: 1;
    padding: 10px;
    background: #002200;
    border: 1px solid #00ff41;
    color: #00ff41;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.2s;
  }
  button:hover { background: #003d00; }
  button:active { background: #00ff41; color: #000; }
  .scan-btn {
    flex: none;
    width: auto;
    padding: 8px 14px;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .wifi-row { display: flex; gap: 8px; align-items: flex-start; }
  .wifi-row .field { flex: 1; }
  #scanResults {
    max-height: 120px;
    overflow-y: auto;
    margin-bottom: 16px;
    display: none;
  }
  #scanResults div {
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
    border-bottom: 1px solid #002200;
  }
  #scanResults div:hover { background: #002200; }
  .status {
    text-align: center;
    font-size: 12px;
    margin-top: 16px;
    min-height: 16px;
  }
  .blink { animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .sep {
    border: none;
    border-top: 1px dashed #003d00;
    margin: 16px 0;
  }
</style>
</head>
<body>
<div class="container">
  <h1>[ RFID READER SETUP ]</h1>
  <div class="subtitle">Colony NFC Scanner Configuration</div>

  <form id="configForm" action="/save" method="POST">
    <label class="prompt">WiFi Network</label>
    <div class="wifi-row">
      <div class="field">
        <input type="text" id="ssid" name="ssid" placeholder="SSID" required>
      </div>
      <button type="button" class="scan-btn" onclick="scanWifi()">SCAN</button>
    </div>
    <div id="scanResults"></div>

    <label class="prompt">WiFi Password</label>
    <input type="password" id="pass" name="pass" placeholder="password">

    <hr class="sep">

    <label class="prompt">Colony Server URL</label>
    <input type="text" id="server" name="server" placeholder="http://192.168.1.190" value="http://192.168.1.190">

    <label class="prompt">Location ID</label>
    <input type="text" id="location" name="location" placeholder="warehouse-a">

    <label class="prompt">Scanner Name</label>
    <input type="text" id="scanner" name="scanner" placeholder="rfid-reader-01">

    <hr class="sep">

    <div class="btn-row">
      <button type="submit">[ SAVE &amp; REBOOT ]</button>
    </div>
  </form>

  <div id="status" class="status"></div>
</div>

<script>
function scanWifi() {
  var btn = event.target;
  btn.textContent = '...';
  btn.disabled = true;
  var box = document.getElementById('scanResults');
  box.style.display = 'block';
  box.innerHTML = '<div class="blink">Scanning...</div>';
  fetch('/scan')
    .then(function(r) { return r.json(); })
    .then(function(networks) {
      box.innerHTML = '';
      if (networks.length === 0) {
        box.innerHTML = '<div>No networks found</div>';
      } else {
        networks.forEach(function(n) {
          var d = document.createElement('div');
          d.textContent = n.ssid + ' (' + n.rssi + ' dBm)';
          d.onclick = function() {
            document.getElementById('ssid').value = n.ssid;
            box.style.display = 'none';
          };
          box.appendChild(d);
        });
      }
      btn.textContent = 'SCAN';
      btn.disabled = false;
    })
    .catch(function() {
      box.innerHTML = '<div>Scan failed</div>';
      btn.textContent = 'SCAN';
      btn.disabled = false;
    });
}

document.getElementById('configForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var status = document.getElementById('status');
  status.textContent = 'Saving configuration...';
  status.className = 'status blink';
  var form = new FormData(this);
  fetch('/save', {
    method: 'POST',
    body: new URLSearchParams(form)
  })
  .then(function(r) { return r.text(); })
  .then(function() {
    status.textContent = 'Saved! Rebooting in 2 seconds...';
    status.className = 'status';
  })
  .catch(function() {
    status.textContent = 'Error saving configuration';
    status.className = 'status';
  });
});
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_HTML_H
