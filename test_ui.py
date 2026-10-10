"""Browser smoke checks. Run on a Windows machine after starting server.py; requires playwright and installed Chromium."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page()
    errors=[]
    page.on('pageerror',lambda err: errors.append(str(err)))
    page.goto('http://127.0.0.1:8765/',wait_until='domcontentloaded')
    for name in ['overview','devices','interfaces','history','monitor','incidents']:
        page.locator(f'[data-view="{name}"]').click()
        assert page.locator(f'#{name}View').is_visible(), name
    page.locator('#searchDevices').fill('192.0.2.1')
    assert page.locator('#searchDevices').input_value()=='192.0.2.1'
    page.locator('#autoRefresh').check()
    assert page.locator('#autoRefresh').is_checked()
    page.locator('#autoRefresh').uncheck()
    page.locator('#latencyThreshold').fill('120')
    page.locator('#saveAlertBtn').click()
    assert 'Guardado' in page.locator('#saveAlertBtn').inner_text()
    assert not errors, errors
    print('PASS: navegación (6), filtro, actualización opcional, guardar reglas, sin errores JS')
    browser.close()
