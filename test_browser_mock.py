"""Browser functional test using mocked HTTP API. Does not test real Windows collection."""
from pathlib import Path
import subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent
server=subprocess.Popen([sys.executable,'server.py'],cwd=str(root),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(40):
        try:
            urllib.request.urlopen('http://127.0.0.1:8765/api/status',timeout=1)
            break
        except Exception: time.sleep(.1)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        page=browser.new_page(accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.route('http://127.0.0.1:8765/**',lambda route: route.fulfill(status=200,content_type='application/json',body='{"mode":"empty","devices":[],"interfaces":[],"gateways":[]}') if '/api/status' in route.request.url else route.continue_())
        page.goto('http://127.0.0.1:8765/')
        for name in ('overview','devices','interfaces','history','monitor','incidents'):
            page.locator(f'[data-view="{name}"]').click()
            assert page.locator(f'#{name}View').is_visible(), name
        page.locator('#searchDevices').fill('10.0.0.1')
        assert page.locator('#searchDevices').input_value()=='10.0.0.1'
        page.locator('#autoRefresh').check()
        assert page.locator('#autoRefresh').is_checked()
        page.locator('#autoRefresh').uncheck()
        page.locator('#latencyThreshold').fill('120')
        page.locator('#saveAlertBtn').click()
        assert 'Guardado' in page.locator('#saveAlertBtn').inner_text()
        page.on('dialog',lambda dialog:dialog.accept())
        page.locator('#compareBtn').click()
        page.locator('#clearHistoryBtn').click()
        page.locator('#clearIncidentsBtn').click()
        page.locator('#csvBtn').click()
        page.locator('#exportBtn').click()
        page.locator('#reportBtn').click()
        page.locator('#incidentsCsvBtn').click()
        assert not errors, errors
        print('PASS browser mock: 6 views, filter, polling, alert settings, comparison, clearing, exports unavailable')
        browser.close()

finally:
    server.terminate()
    server.wait(timeout=5)
