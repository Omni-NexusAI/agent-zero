"""
Browser automation script to test UI changes in the local app v2
"""
import time
import sys
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

def test_app():
    print("Starting browser test...")
    
    # Setup Chrome options
    chrome_options = Options()
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    
    driver = None
    results = {
        'settings_opened': False,
        'banner_visible': False,
        'speech_section_found': False,
        'tts_device_is_dropdown': False,
        'tts_device_position_correct': False,
        'device_has_gpu_options': False,
        'blend_control_present': False,
        'chat_model_section_found': False,
        'model_history_ui_present': False,
        'enter_to_stage_works': False,
        'lm_studio_autofill_works': False,
        'ollama_autofill_works': False,
        'banner_text': '',
        'errors': []
    }
    
    try:
        driver = webdriver.Chrome(options=chrome_options)
        wait = WebDriverWait(driver, 10)
        driver.get('http://127.0.0.1:8896')
        
        print("Waiting for app to load...")
        time.sleep(4)
        
        driver.save_screenshot('C:\\agent-zero\\test_screenshots\\01_initial_load.png')
        print("[+] App loaded successfully")

        print("\n[0] Reading sidebar banner...")
        try:
            banner = wait.until(EC.presence_of_element_located((By.ID, 'a0version')))
            results['banner_text'] = banner.text.strip()
            results['banner_visible'] = bool(results['banner_text'])
            print(f"  [+] Banner text: {results['banner_text']}")
        except Exception as e:
            results['errors'].append(f"Failed to read sidebar banner: {str(e)}")
            print(f"  [-] Failed to read sidebar banner: {str(e)}")
        
        # Click settings button
        print("\n[1] Opening Settings...")
        try:
            settings_btn = wait.until(EC.element_to_be_clickable((By.ID, 'settings')))
            driver.execute_script("arguments[0].scrollIntoView(true);", settings_btn)
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", settings_btn)
            time.sleep(3)  # Wait for modal to fully load
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\02_settings_opened.png')
            results['settings_opened'] = True
            print("  [+] Settings modal opened")
        except Exception as e:
            results['errors'].append(f"Failed to open settings: {str(e)}")
            print(f"  [-] Failed to open settings: {str(e)}")
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\02_settings_error.png')
            return results
        
        # Navigate to Agent Settings tab if not already there
        print("\n[2] Ensuring Agent Settings tab is active...")
        try:
            agent_tab = driver.find_element(By.XPATH, "//div[contains(@class, 'settings-tab') and contains(text(), 'Agent Settings')]")
            driver.execute_script("arguments[0].click();", agent_tab)
            time.sleep(1)
            print("  [+] Agent Settings tab activated")
        except Exception as e:
            print(f"  [?] Could not click Agent Settings tab (might already be active): {str(e)}")
        
        # Navigate to Speech section
        print("\n[3] Navigating to Speech section...")
        try:
            # Click on Speech link in the nav
            speech_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//a[@href='#section-speech']")))
            driver.execute_script("arguments[0].click();", speech_link)
            time.sleep(2)
            
            # Verify we're in the speech section
            speech_section = driver.find_element(By.ID, 'section-speech')
            driver.execute_script("arguments[0].scrollIntoView(true);", speech_section)
            time.sleep(1)
            
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\03_speech_section.png')
            results['speech_section_found'] = True
            print("  [+] Speech section found and navigated to")
        except Exception as e:
            results['errors'].append(f"Failed to navigate to Speech section: {str(e)}")
            print(f"  [-] Failed to navigate to Speech section: {str(e)}")
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\03_speech_error.png')
        
        # Check TTS device control
        if results['speech_section_found']:
            print("\n[4] Checking TTS device control...")
            try:
                # Look for TTS device select
                tts_device_selects = driver.find_elements(By.XPATH, "//select[contains(@x-model, 'tts_device')]")
                
                if tts_device_selects:
                    tts_select = tts_device_selects[0]
                    results['tts_device_is_dropdown'] = True
                    print("  [+] TTS device is a dropdown/select")
                    
                    # Check for GPU/CUDA options
                    options = tts_select.find_elements(By.TAG_NAME, 'option')
                    option_texts = [opt.text.lower() for opt in options]
                    has_gpu = any('gpu' in txt or 'cuda' in txt for txt in option_texts)
                    results['device_has_gpu_options'] = has_gpu
                    if has_gpu:
                        print(f"  [+] GPU/CUDA options found: {[opt.text for opt in options if 'gpu' in opt.text.lower() or 'cuda' in opt.text.lower()]}")
                    else:
                        print(f"  [-] No GPU/CUDA options found. Options: {[opt.text for opt in options]}")
                    
                    # Check position relative to Kokoro voice selectors
                    print("\n[5] Checking TTS device position...")
                    try:
                        # Find Kokoro voice selector (Primary voice field)
                        kokoro_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Primary voice')]")
                        if kokoro_elements:
                            device_y = tts_select.location['y']
                            kokoro_y = kokoro_elements[0].location['y']
                            
                            if device_y < kokoro_y:
                                results['tts_device_position_correct'] = True
                                print(f"  [+] TTS device (y={device_y}) appears BEFORE Kokoro voice (y={kokoro_y})")
                            else:
                                print(f"  [-] TTS device (y={device_y}) appears AFTER Kokoro voice (y={kokoro_y})")
                        else:
                            print("  [?] Could not find Kokoro voice selector for position comparison")
                    except Exception as e:
                        print(f"  [?] Error checking position: {str(e)}")
                else:
                    print("  [-] TTS device select not found")
                    # Check if it's a text input instead
                    tts_text_inputs = driver.find_elements(By.XPATH, "//input[@type='text' and contains(@x-model, 'tts_device')]")
                    if tts_text_inputs:
                        print("  [-] FAIL: TTS device is a text input, not a dropdown!")
                    
            except Exception as e:
                results['errors'].append(f"Error checking TTS device: {str(e)}")
                print(f"  [-] Error checking TTS device: {str(e)}")

        # Check blend ratio control
        if results['speech_section_found']:
            print("\n[5b] Checking blend ratio control...")
            try:
                blend_title = driver.find_elements(By.XPATH, "//*[contains(text(), 'Primary voice blend %')]")
                blend_controls = driver.find_elements(By.XPATH, "//input[@type='range' and @min='1' and @max='99']")
                if blend_title and blend_controls:
                    results['blend_control_present'] = True
                    print("  [+] Blend ratio slider is present")
                else:
                    print("  [-] Blend ratio slider not found")
            except Exception as e:
                results['errors'].append(f"Error checking blend ratio control: {str(e)}")
                print(f"  [-] Error checking blend ratio control: {str(e)}")
        
        # Navigate to Chat Model section
        print("\n[6] Navigating to Chat Model section...")
        try:
            chat_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//a[@href='#section-chat-model']")))
            driver.execute_script("arguments[0].click();", chat_link)
            time.sleep(2)
            
            chat_section = driver.find_element(By.ID, 'section-chat-model')
            driver.execute_script("arguments[0].scrollIntoView(true);", chat_section)
            time.sleep(1)
            
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\04_chat_model_section.png')
            results['chat_model_section_found'] = True
            print("  [+] Chat Model section found")
        except Exception as e:
            results['errors'].append(f"Failed to navigate to Chat Model section: {str(e)}")
            print(f"  [-] Failed to navigate to Chat Model section: {str(e)}")
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\04_chat_error.png')
        
        # Check model history UI
        if results['chat_model_section_found']:
            print("\n[7] Checking model name history UI...")
            try:
                # Look for the model-dropdown-btn button
                dropdown_btns = driver.find_elements(By.CLASS_NAME, 'model-dropdown-btn')
                remove_btns = driver.find_elements(By.CLASS_NAME, 'model-remove-btn')
                
                if dropdown_btns and remove_btns:
                    results['model_history_ui_present'] = True
                    print("  [+] Model history UI elements found (dropdown button and remove button)")
                else:
                    print(f"  [-] Model history UI incomplete. Dropdown btns: {len(dropdown_btns)}, Remove btns: {len(remove_btns)}")
            except Exception as e:
                results['errors'].append(f"Error checking model history UI: {str(e)}")
                print(f"  [-] Error checking model history UI: {str(e)}")
        
        # Test Enter-to-stage
        if results['chat_model_section_found']:
            print("\n[8] Testing Enter-to-stage for model name...")
            try:
                # Find the chat model name input
                model_input = driver.find_element(By.XPATH, "//input[contains(@x-model, 'chat_model_name')]")
                
                # Store original value
                original_value = model_input.get_attribute('value')
                print(f"  Original model name: {original_value}")
                
                # Type test model name
                test_model = "test-selenium-model-12345"
                driver.execute_script("arguments[0].scrollIntoView(true);", model_input)
                model_input.clear()
                model_input.send_keys(test_model)
                driver.save_screenshot('C:\\agent-zero\\test_screenshots\\05_model_typed.png')
                print(f"  Typed test model: {test_model}")
                
                # Press Enter
                model_input.send_keys(Keys.RETURN)
                time.sleep(1)
                driver.save_screenshot('C:\\agent-zero\\test_screenshots\\06_model_enter_pressed.png')
                print("  Pressed Enter")
                
                # Open the dropdown to check if model appears
                dropdown_btn = driver.find_element(By.CLASS_NAME, 'model-dropdown-btn')
                driver.execute_script("arguments[0].click();", dropdown_btn)
                time.sleep(1)
                driver.save_screenshot('C:\\agent-zero\\test_screenshots\\07_model_dropdown_opened.png')
                print("  Opened dropdown")
                
                # Check if test model appears in dropdown
                dropdown_items = driver.find_elements(By.CLASS_NAME, 'model-dropdown-item')
                item_texts = [item.text for item in dropdown_items]
                
                if test_model in item_texts:
                    results['enter_to_stage_works'] = True
                    print(f"  [+] Test model found in history dropdown!")
                else:
                    print(f"  [-] Test model NOT found in dropdown. Items: {item_texts}")
                
                # Close dropdown and restore original value
                driver.execute_script("arguments[0].click();", dropdown_btn)
                time.sleep(0.5)
                model_input.clear()
                model_input.send_keys(original_value)
                
            except Exception as e:
                results['errors'].append(f"Error testing Enter-to-stage: {str(e)}")
                print(f"  [-] Error testing Enter-to-stage: {str(e)}")
                driver.save_screenshot('C:\\agent-zero\\test_screenshots\\07_enter_stage_error.png')
        
        # Test provider auto-fill
        if results['chat_model_section_found']:
            print("\n[9] Testing provider auto-fill...")
            try:
                # Find provider select - it should be in section-chat-model
                all_selects = driver.find_elements(By.TAG_NAME, 'select')
                provider_select = None
                
                # Find the select that's bound to chat_model_provider (first select in chat model section)
                chat_section = driver.find_element(By.ID, 'section-chat-model')
                selects_in_section = chat_section.find_elements(By.TAG_NAME, 'select')
                if selects_in_section:
                    provider_select = selects_in_section[0]  # First select is the provider
                
                if not provider_select:
                    print("  [-] Could not find provider select")
                    results['errors'].append("Could not find provider select element")
                else:
                    api_base_input = driver.find_element(By.XPATH, "//input[contains(@x-model, 'chat_model_api_base')]")
                    
                    # Store original values
                    original_provider_value = provider_select.get_attribute('value')
                    original_api_base = api_base_input.get_attribute('value')
                    print(f"  Original provider: {original_provider_value}, API base: {original_api_base}")
                    
                    # Test lm_studio
                    print("  Testing lm_studio provider...")
                    api_base_input.clear()
                    time.sleep(0.5)
                    
                    # Force provider change event even if lm_studio is already selected
                    driver.execute_script("""
                        arguments[0].value = 'openrouter';
                        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                    """, provider_select)
                    time.sleep(0.5)
                    driver.execute_script("""
                        arguments[0].value = 'lm_studio';
                        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                    """, provider_select)
                    time.sleep(2)  # Wait for auto-fill
                    driver.save_screenshot('C:\\agent-zero\\test_screenshots\\08_lm_studio_selected.png')
                    
                    api_value = api_base_input.get_attribute('value')
                    if api_value == 'http://host.docker.internal:1234/v1':
                        results['lm_studio_autofill_works'] = True
                        print(f"  [+] lm_studio auto-filled correctly: {api_value}")
                    else:
                        print(f"  [-] lm_studio did NOT auto-fill correctly. Value: '{api_value}'")
                    
                    # Test ollama
                    print("  Testing ollama provider...")
                    # Ensure API base is truly empty by setting it through JavaScript
                    driver.execute_script("arguments[0].value = ''; arguments[0].dispatchEvent(new Event('input')); arguments[0].dispatchEvent(new Event('change'));", api_base_input)
                    time.sleep(0.5)
                    
                    # Select ollama option via change event to ensure Alpine picks it up
                    driver.execute_script("""
                        arguments[0].value = 'ollama';
                        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                    """, provider_select)
                    time.sleep(2)  # Wait for auto-fill
                    driver.save_screenshot('C:\\agent-zero\\test_screenshots\\09_ollama_selected.png')
                    
                    api_value = api_base_input.get_attribute('value')
                    if api_value == 'http://host.docker.internal:11434':
                        results['ollama_autofill_works'] = True
                        print(f"  [+] ollama auto-filled correctly: {api_value}")
                    else:
                        print(f"  [-] ollama did NOT auto-fill correctly. Value: '{api_value}'")
                    
                    # Restore original values
                    driver.execute_script("""
                        arguments[0].value = arguments[1];
                        arguments[0].dispatchEvent(new Event('change', { bubbles: true }));
                    """, provider_select, original_provider_value)
                    time.sleep(1)
                    if original_api_base:
                        api_base_input.clear()
                        api_base_input.send_keys(original_api_base)
                        
            except Exception as e:
                results['errors'].append(f"Error testing provider auto-fill: {str(e)}")
                print(f"  [-] Error testing provider auto-fill: {str(e)}")
                driver.save_screenshot('C:\\agent-zero\\test_screenshots\\09_autofill_error.png')
        
        # Final screenshot
        driver.save_screenshot('C:\\agent-zero\\test_screenshots\\10_final.png')
        
    except Exception as e:
        results['errors'].append(f"Fatal error: {str(e)}")
        print(f"\n[!] FATAL ERROR: {str(e)}")
        if driver:
            driver.save_screenshot('C:\\agent-zero\\test_screenshots\\error_fatal.png')
    finally:
        if driver:
            driver.quit()
    
    return results

if __name__ == '__main__':
    import os
    
    # Set UTF-8 encoding for console output
    if sys.platform == 'win32':
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    
    os.makedirs('C:\\agent-zero\\test_screenshots', exist_ok=True)
    
    results = test_app()
    
    print("\n" + "="*70)
    print("TEST RESULTS SUMMARY")
    print("="*70)
    if results.get('banner_text'):
        print(f"\nBanner text: {results['banner_text']}")
    
    passed = []
    failed = []
    
    for key, value in results.items():
        if key not in ('errors', 'banner_text'):
            if value is True:
                passed.append(key)
            elif value is False:
                failed.append(key)
    
    print("\n[+] PASSED ({}/{}):".format(len(passed), len(passed) + len(failed)))
    for item in passed:
        print(f"  - {item}")
    
    if not passed:
        print("  (none)")
    
    print("\n[-] FAILED ({}/{}):".format(len(failed), len(passed) + len(failed)))
    for item in failed:
        print(f"  - {item}")
    
    if not failed:
        print("  (none)")
    
    if results['errors']:
        print("\n[!] ERRORS ENCOUNTERED:")
        for error in results['errors']:
            print(f"  - {error}")
    
    print("\n" + "="*70)
    print("CONCLUSION:")
    if len(failed) == 0 and not results['errors']:
        print("  ALL TESTS PASSED! Mounted workspace changes are live in the UI.")
    elif len(passed) > 0:
        print("  PARTIAL SUCCESS: Some features working, others need attention.")
    else:
        print("  TESTS FAILED: Mounted workspace changes may not be reflected.")
    print("="*70)
    
    print(f"\nScreenshots saved to: C:\\agent-zero\\test_screenshots\\")
