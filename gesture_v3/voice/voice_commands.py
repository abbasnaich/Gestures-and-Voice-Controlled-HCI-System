"""
Voice Command System
Handles voice recognition, command execution, and text-to-speech feedback
Runs in a separate thread to avoid blocking the gesture control system
"""

import threading
import time
import webbrowser
import subprocess
import os
try:
    import pyautogui
except ImportError:
    pyautogui = None
from datetime import datetime
from difflib import SequenceMatcher

try:
    import speech_recognition as sr
    import pyttsx3
    VOICE_AVAILABLE = True
except ImportError:
    VOICE_AVAILABLE = False
    print("Voice libraries not available. Install: SpeechRecognition, pyttsx3, pyaudio")


class VoiceCommandSystem:
    """
    Voice Command System for executing predefined commands via voice input.
    Runs in a separate daemon thread to prevent blocking the main gesture control loop.
    """
    
    def __init__(self):
        """Initialize the voice command system"""
        self.is_listening = False
        self.listen_thread = None
        self.recognizer = None
        self.tts_engine = None
        
        self.mode = "ACTIVE"  # "ACTIVE" or "STANDBY"

        
        # Command mappings: spoken phrase -> (response, action)
        self.commands = {
            "open chrome": ("Opening Chrome", self._open_chrome),
            "open youtube": ("Opening YouTube", self._open_youtube),
            "open google": ("Opening Google", self._open_google),
            "open notepad": ("Opening Notepad", self._open_notepad),
            "open calculator": ("Opening Calculator", self._open_calculator),
            "open file explorer": ("Opening File Explorer", self._open_file_explorer),
            "open settings": ("Opening Settings", self._open_settings),
            "open task manager": ("Opening Task Manager", self._open_task_manager),
            "open control panel": ("Opening Control Panel", self._open_control_panel),
            "open word": ("Opening Word", self._open_word),
            "open excel": ("Opening Excel", self._open_excel),
            "open powerpoint": ("Opening PowerPoint", self._open_powerpoint),
            "open paint": ("Opening Paint", self._open_paint),
            "open whatsapp": ("Opening WhatsApp", self._open_whatsapp),
            "open vlc": ("Opening VLC Media Player", self._open_vlc),
            "open facebook": ("Opening Facebook", self._open_facebook),
            "open instagram": ("Opening Instagram", self._open_instagram),
            "close whatsapp": ("Closing WhatsApp", self._close_whatsapp),
            "close vlc": ("Closing VLC Media Player", self._close_vlc),
            "close facebook": ("Closing Facebook", self._close_facebook),
            "close instagram": ("Closing Instagram", self._close_instagram),
            "close chrome": ("Closing Chrome", self._close_chrome),
            "close youtube": ("Closing YouTube", self._close_youtube),
            "close google": ("Closing Google", self._close_google),
            "close notepad": ("Closing Notepad", self._close_notepad),
            "close calculator": ("Closing Calculator", self._close_calculator),
            "close file explorer": ("Closing File Explorer", self._close_file_explorer),
            "close settings": ("Closing Settings", self._close_settings),
            "close task manager": ("Closing Task Manager", self._close_task_manager),
            "close control panel": ("Closing Control Panel", self._close_control_panel),
            "close word": ("Closing Word", self._close_word),
            "close excel": ("Closing Excel", self._close_excel),
            "close powerpoint": ("Closing PowerPoint", self._close_powerpoint),
            "close paint": ("Closing Paint", self._close_paint),
            "minimize window": ("Minimizing window", self._minimize_window),
            "lock pc": ("Locking PC", self._lock_pc),
            "take screenshot": ("Taking screenshot", self._take_screenshot),
            "what time is it": (None, self._tell_time),  # Response generated dynamically
            "stop listening": (None, self._stop_listening_command),  # Response handled in action
        }
        
        self.mode = "ACTIVE"  # "ACTIVE" or "STANDBY"
        self.wake_phrases = ["wake up", "start listening", "activate voice", "hey jarvis", "jarvis"]
        
        if not VOICE_AVAILABLE:
            print("[Voice] ERROR: Required libraries not installed.")
            return
        
        try:
            # Initialize speech recognizer
            self.recognizer = sr.Recognizer()
            self.recognizer.energy_threshold = 4000  # Adjust sensitivity
            self.recognizer.dynamic_energy_threshold = True
            
            # TTS will be initialized per-use to avoid threading issues
            self.tts_engine = None
            self.tts_rate = 175
            self.tts_volume = 0.9
            
            print("[Voice] System initialized successfully")
            
        except Exception as e:
            print(f"[Voice] Initialization error: {e}")
            self.tts_engine = None

    def _get_chrome_path(self):
        """Helper to find Chrome executable path"""
        potential_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        for path in potential_paths:
            if os.path.exists(path):
                return path
        return None

    def _close_window_by_title(self, keyword, exclude=None):
        """
        Helper to close a window matching a specific title keyword.
        Optional 'exclude' parameter can be a list of strings to ignore.
        Uses a multi-stage closure to handle 'Access Denied' errors.
        """
        try:
            import pygetwindow as gw
            import pyautogui
            print(f"[Voice] Searching for windows containing: '{keyword}' (excluding: {exclude})")
            # Get all windows
            all_windows = gw.getAllWindows()
            
            closed_any = False
            for window in all_windows:
                # Basic title matching (case insensitive)
                title_lower = window.title.lower()
                if keyword.lower() in title_lower:
                    # Check exclusions
                    should_exclude = False
                    if exclude:
                        for ex in exclude:
                            if ex.lower() in title_lower:
                                should_exclude = True
                                break
                    
                    if should_exclude:
                        print(f"[Voice] Skipping excluded window: '{window.title}'")
                        continue

                    # Safety check: Never close the Gesture Control system itself
                    if "gesture control" in title_lower or "gesture_control" in title_lower:
                        print(f"[Voice] Safety: Skipping closure of system window '{window.title}'")
                        continue
                        
                    print(f"[Voice] Level 1: Attempting standard close for '{window.title}'")
                    try:
                        window.close()
                        print(f"[Voice] Standard close success")
                        closed_any = True
                    except Exception as first_err:
                        # Catch "Access is denied" or similar permission errors
                        print(f"[Voice] Level 1 fail (Access Denied?): {first_err}")
                        print(f"[Voice] Level 2: Attempting Focus + Alt+F4 fallback")
                        try:
                            # Attempt to activate/focus the window first
                            window.activate()
                            time.sleep(0.2) # Wait for focus
                            pyautogui.hotkey('alt', 'f4')
                            print(f"[Voice] Alt+F4 fallback sent")
                            closed_any = True
                        except Exception as second_err:
                            print(f"[Voice] Level 2 fail: {second_err}")
                            # Final attempt: direct win32 message if available
                            try:
                                import win32gui
                                import win32con
                                hwnd = window._hWnd
                                win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                                print(f"[Voice] Level 3: win32 PostMessage sent")
                                closed_any = True
                            except:
                                pass
            
            return closed_any
        except Exception as e:
            print(f"[Voice] Error in _close_window_by_title: {e}")
            return False

    def start_listening(self):
        """
        Start listening for voice commands in a separate thread.
        This is non-blocking and safe to call from the main gesture control loop.
        """
        if not VOICE_AVAILABLE or self.recognizer is None:
            print("[Voice] Cannot start - libraries not available")
            return False
        
        if self.is_listening:
            print("[Voice] Already listening")
            # If in standby, switch to active
            if self.mode == "STANDBY":
                self.mode = "ACTIVE"
                self._speak("Voice command activated")
            return True
        
        self.is_listening = True
        self.mode = "ACTIVE"
        
        # Speak activation message
        self._speak("Voice command activated")
        
        # Start listening thread as daemon (won't block program exit)
        self.listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
        self.listen_thread.start()
        
        print("[Voice] Listening started in background thread")
        return True
    
    def stop_listening(self):
        """Stop listening logic (internal thread stop)"""
        if self.is_listening:
            self.is_listening = False
            print("[Voice] Listening stopped (thread terminating)")
            if self.listen_thread:
                self.listen_thread.join(timeout=2)
    
    def _listen_loop(self):
        """
        Main listening loop that runs in a separate thread.
        Continuously listens for voice commands until stopped.
        Handles both ACTIVE and STANDBY modes.
        """
        print("[Voice] Listening loop started")
        
        with sr.Microphone() as source:
            # Adjust for ambient noise
            print("[Voice] Adjusting for ambient noise... Please wait.")
            self.recognizer.adjust_for_ambient_noise(source, duration=1)
            print("[Voice] Ready! Speak your commands.")
            
            while self.is_listening:
                try:
                    # Listen for audio with timeout
                    # In standby, we might want slightly longer timeouts or same behavior
                    print(f"[Voice] Listening ({self.mode})...")
                    audio = self.recognizer.listen(source, timeout=5, phrase_time_limit=5)
                    
                    # Recognize speech
                    text = self.recognizer.recognize_google(audio).lower()
                    print(f"[Voice] You said: '{text}'")
                    
                    if self.mode == "ACTIVE":
                        # Process all commands
                        self._process_command(text)
                        
                    elif self.mode == "STANDBY":
                        # Only check for wake phrases
                        matched_wake = False
                        for phrase in self.wake_phrases:
                            if phrase in text:
                                matched_wake = True
                                break
                        
                        if matched_wake:
                            self.mode = "ACTIVE"
                            print("[Voice] Wake phrase detected! Switching to ACTIVE mode.")
                            self._speak("Voice command activated")
                            # Optionally execute command if user said "Wake up and open chrome"
                            # For now, just wake up.
                        else:
                            print("[Voice] Ignored in Standby mode")
                    
                except sr.WaitTimeoutError:
                    continue
                    
                except sr.UnknownValueError:
                    # print("[Voice] Could not understand audio")
                    pass
                    
                except sr.RequestError as e:
                    print(f"[Voice] Recognition service error: {e}")
                    self._speak("Voice recognition service unavailable")
                    time.sleep(2)
                    
                except Exception as e:
                    print(f"[Voice] Unexpected error: {e}")
                    time.sleep(1)
        
        print("[Voice] Listening loop ended")
    
    def _process_command(self, text):
        """
        Process the recognized text and execute matching command.
        Uses fuzzy matching to handle variations in spoken commands.
        """
        # Try exact match first
        if text in self.commands:
            response, action = self.commands[text]
            if response:
                self._speak(response)
            if action:
                action()
            return
        
        # Fuzzy matching for partial matches
        best_match = None
        best_score = 0.0
        
        for command_key in self.commands.keys():
            # Check if command_key is in the spoken text or vice versa
            if command_key in text or text in command_key:
                score = SequenceMatcher(None, text, command_key).ratio()
                if score > best_score and score > 0.6:  # 60% confidence threshold
                    best_score = score
                    best_match = command_key
        
        if best_match:
            print(f"[Voice] Matched '{text}' to '{best_match}' (confidence: {best_score:.2f})")
            response, action = self.commands[best_match]
            if response:
                self._speak(response)
            if action:
                action()
        else:
            print(f"[Voice] No match found for '{text}'")
            self._speak("Command not recognized")
    
    def _speak(self, text):
        """
        Speak the given text using TTS.
        Creates a new engine instance to avoid threading issues.
        """
        print(f"[Voice] Speaking: {text}")
        
        try:
            # Create new engine instance for this speech to avoid threading issues
            engine = pyttsx3.init()
            engine.setProperty('rate', self.tts_rate)
            engine.setProperty('volume', self.tts_volume)
            
            # Configure voice (use male voice)
            try:
                voices = engine.getProperty('voices')
                if len(voices) > 0:
                    engine.setProperty('voice', voices[0].id)  # male voice
            except:
                pass  # Use default voice if selection fails
            
            engine.say(text)
            engine.runAndWait()
            engine.stop()
            
        except Exception as e:
            print(f"[Voice] TTS error: {e}")
            # Continue even if TTS fails
    
    # ==================== Command Actions ====================
    
    def _open_chrome(self):
        """Open Google Chrome browser in a new window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window"])
                print("[Voice] Chrome opened in new window")
            else:
                webbrowser.open("https://www.google.com")
                print("[Voice] Chrome opened via fallback")
        except Exception as e:
            print(f"[Voice] Error opening Chrome: {e}")
            self._speak("Could not open Chrome")
    
    def _open_youtube(self):
        """Open YouTube in a new browser window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window", "https://www.youtube.com"])
                print("[Voice] YouTube opened in new window")
            else:
                webbrowser.open("https://www.youtube.com")
                print("[Voice] YouTube opened via fallback")
        except Exception as e:
            print(f"[Voice] Error opening YouTube: {e}")
            self._speak("Could not open YouTube")
    
    def _open_google(self):
        """Open Google in a new browser window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window", "https://www.google.com"])
                print("[Voice] Google opened in new window")
            else:
                webbrowser.open("https://www.google.com")
                print("[Voice] Google opened via fallback")
        except Exception as e:
            print(f"[Voice] Error opening Google: {e}")
            self._speak("Could not open Google")
    
    def _open_notepad(self):
        """Open Notepad application"""
        try:
            subprocess.Popen(["notepad.exe"])
            print("[Voice] Notepad opened")
        except Exception as e:
            print(f"[Voice] Error opening Notepad: {e}")
            self._speak("Could not open Notepad")
    
    def _open_calculator(self):
        """Open Calculator application"""
        try:
            subprocess.Popen(["calc.exe"])
            print("[Voice] Calculator opened")
        except Exception as e:
            print(f"[Voice] Error opening Calculator: {e}")
            self._speak("Could not open Calculator")
    
    def _open_file_explorer(self):
        """Open Windows File Explorer"""
        try:
            subprocess.Popen(["explorer.exe"])
            print("[Voice] File Explorer opened")
        except Exception as e:
            print(f"[Voice] Error opening File Explorer: {e}")
            self._speak("Could not open File Explorer")
    
    def _open_settings(self):
        """Open Windows Settings"""
        try:
            subprocess.Popen(["start", "ms-settings:"], shell=True)
            print("[Voice] Settings opened")
        except Exception as e:
            print(f"[Voice] Error opening Settings: {e}")
            self._speak("Could not open Settings")
    
    def _open_task_manager(self):
        """Open Windows Task Manager"""
        try:
            subprocess.Popen(["taskmgr.exe"])
            print("[Voice] Task Manager opened")
        except Exception as e:
            print(f"[Voice] Error opening Task Manager: {e}")
            self._speak("Could not open Task Manager")
    
    def _open_control_panel(self):
        """Open Windows Control Panel"""
        try:
            subprocess.Popen(["control.exe"])
            print("[Voice] Control Panel opened")
        except Exception as e:
            print(f"[Voice] Error opening Control Panel: {e}")
            self._speak("Could not open Control Panel")
    
    def _open_word(self):
        """Open Microsoft Word"""
        try:
            word_paths = [
                r"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE",
                r"C:\Program Files (x86)\Microsoft Office\root\Office16\WINWORD.EXE",
            ]
            opened = False
            for path in word_paths:
                if os.path.exists(path):
                    subprocess.Popen([path])
                    print("[Voice] Word opened")
                    opened = True
                    break
            if not opened:
                # Try using start command
                subprocess.Popen(["start", "winword"], shell=True)
                print("[Voice] Word opened via shell")
        except Exception as e:
            print(f"[Voice] Error opening Word: {e}")
            self._speak("Could not open Word")
    
    def _open_excel(self):
        """Open Microsoft Excel"""
        try:
            excel_paths = [
                r"C:\Program Files\Microsoft Office\root\Office16\EXCEL.EXE",
                r"C:\Program Files (x86)\Microsoft Office\root\Office16\EXCEL.EXE",
            ]
            opened = False
            for path in excel_paths:
                if os.path.exists(path):
                    subprocess.Popen([path])
                    print("[Voice] Excel opened")
                    opened = True
                    break
            if not opened:
                # Try using start command
                subprocess.Popen(["start", "excel"], shell=True)
                print("[Voice] Excel opened via shell")
        except Exception as e:
            print(f"[Voice] Error opening Excel: {e}")
            self._speak("Could not open Excel")
    
    def _open_powerpoint(self):
        """Open Microsoft PowerPoint"""
        try:
            ppt_paths = [
                r"C:\Program Files\Microsoft Office\root\Office16\POWERPNT.EXE",
                r"C:\Program Files (x86)\Microsoft Office\root\Office16\POWERPNT.EXE",
            ]
            opened = False
            for path in ppt_paths:
                if os.path.exists(path):
                    subprocess.Popen([path])
                    print("[Voice] PowerPoint opened")
                    opened = True
                    break
            if not opened:
                # Try using start command
                subprocess.Popen(["start", "powerpnt"], shell=True)
                print("[Voice] PowerPoint opened via shell")
        except Exception as e:
            print(f"[Voice] Error opening PowerPoint: {e}")
            self._speak("Could not open PowerPoint")
    
    def _open_paint(self):
        """Open Microsoft Paint"""
        try:
            subprocess.Popen(["mspaint.exe"])
            print("[Voice] Paint opened")
        except Exception as e:
            print(f"[Voice] Error opening Paint: {e}")
            self._speak("Could not open Paint")

    def _open_whatsapp(self):
        """Open WhatsApp Web in a new browser window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window", "https://web.whatsapp.com"])
                print("[Voice] WhatsApp opened in new window")
            else:
                webbrowser.open("https://web.whatsapp.com")
        except Exception as e:
            print(f"[Voice] Error opening WhatsApp: {e}")
            self._speak("Could not open WhatsApp")  

    def _open_vlc(self):
        """Open VLC Media Player"""
        try:
            vlc_paths = [
                r"C:\Program Files\VideoLAN\VLC\vlc.exe",
                r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
            ]
            for path in vlc_paths:
                if os.path.exists(path):
                    subprocess.Popen([path])
                    print("[Voice] VLC Media Player opened")
                    return
            self._speak("Could not find VLC Media Player")
        except Exception as e:
            print(f"[Voice] Error opening VLC: {e}")
            self._speak("Could not open VLC Media Player")

    def _open_facebook(self):
        """Open Facebook in a new browser window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window", "https://www.facebook.com"])
                print("[Voice] Facebook opened in new window")
            else:
                webbrowser.open("https://www.facebook.com")
        except Exception as e:
            print(f"[Voice] Error opening Facebook: {e}")
            self._speak("Could not open Facebook")
    
    def _open_instagram(self):  
        """Open Instagram in a new browser window"""
        try:
            chrome_path = self._get_chrome_path()
            if chrome_path:
                subprocess.Popen([chrome_path, "--new-window", "https://www.instagram.com"])
                print("[Voice] Instagram opened in new window")
            else:
                webbrowser.open("https://www.instagram.com")
        except Exception as e:
            print(f"[Voice] Error opening Instagram: {e}")
            self._speak("Could not open Instagram")
    
    # ==================== Close Commands ====================
    
    def _close_chrome(self):
        """Close generic Google Chrome windows, excluding managed apps"""
        managed_apps = ["WhatsApp", "Facebook", "Instagram", "YouTube"]
        if not self._close_window_by_title("Chrome", exclude=managed_apps):
            self._speak("No generic Chrome window found")

    def _close_youtube(self):
        """Close YouTube window"""
        if not self._close_window_by_title("YouTube"):
            self._speak("YouTube window not found")

    def _close_google(self):
        """Close Google window"""
        if not self._close_window_by_title("Google"):
            self._speak("Google window not found")
    
    def _close_notepad(self):
        """Close Notepad"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "notepad.exe"], shell=True)
            print("[Voice] Notepad closed")
        except Exception as e:
            print(f"[Voice] Error closing Notepad: {e}")
            self._speak("Could not close Notepad")
    
    def _close_calculator(self):
        """Close Calculator"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "CalculatorApp.exe"], shell=True)
            print("[Voice] Calculator closed")
        except Exception as e:
            print(f"[Voice] Error closing Calculator: {e}")
            self._speak("Could not close Calculator")
    
    def _close_file_explorer(self):
        """Close File Explorer"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "explorer.exe"], shell=True)
            # Restart explorer to keep Windows functional
            time.sleep(0.5)
            subprocess.Popen(["explorer.exe"])
            print("[Voice] File Explorer closed")
        except Exception as e:
            print(f"[Voice] Error closing File Explorer: {e}")
            self._speak("Could not close File Explorer")
    
    def _close_settings(self):
        """Close Windows Settings"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "SystemSettings.exe"], shell=True)
            print("[Voice] Settings closed")
        except Exception as e:
            print(f"[Voice] Error closing Settings: {e}")
            self._speak("Could not close Settings")
    
    def _close_task_manager(self):
        """Close Task Manager window"""
        if not self._close_window_by_title("Task Manager"):
            self._speak("Task Manager window not found")
    
    def _close_control_panel(self):
        """Close Control Panel"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "control.exe"], shell=True)
            print("[Voice] Control Panel closed")
        except Exception as e:
            print(f"[Voice] Error closing Control Panel: {e}")
            self._speak("Could not close Control Panel")
    
    def _close_camera(self):
        """Close Windows Camera"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "WindowsCamera.exe"], shell=True)
            print("[Voice] Camera closed")
        except Exception as e:
            print(f"[Voice] Error closing Camera: {e}")
            self._speak("Could not close Camera")
    
    def _close_word(self):
        """Close Microsoft Word"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "WINWORD.EXE"], shell=True)
            print("[Voice] Word closed")
        except Exception as e:
            print(f"[Voice] Error closing Word: {e}")
            self._speak("Could not close Word")
    
    def _close_excel(self):
        """Close Microsoft Excel"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "EXCEL.EXE"], shell=True)
            print("[Voice] Excel closed")
        except Exception as e:
            print(f"[Voice] Error closing Excel: {e}")
            self._speak("Could not close Excel")
    
    def _close_powerpoint(self):
        """Close Microsoft PowerPoint"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "POWERPNT.EXE"], shell=True)
            print("[Voice] PowerPoint closed")
        except Exception as e:
            print(f"[Voice] Error closing PowerPoint: {e}")
            self._speak("Could not close PowerPoint")
    
    def _close_paint(self):
        """Close Microsoft Paint"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "mspaint.exe"], shell=True)
            print("[Voice] Paint closed")
        except Exception as e:
            print(f"[Voice] Error closing Paint: {e}")
            self._speak("Could not close Paint")

    def _close_whatsapp(self):
        """Close WhatsApp window"""
        if not self._close_window_by_title("WhatsApp"):
            self._speak("WhatsApp window not found")

    def _close_vlc(self):
        """Close VLC Media Player"""
        try:
            subprocess.Popen(["taskkill", "/F", "/IM", "vlc.exe"], shell=True)
            print("[Voice] VLC Media Player closed")
        except Exception as e:
            print(f"[Voice] Error closing VLC: {e}")
            self._speak("Could not close VLC Media Player")

    def _close_facebook(self):
        """Close Facebook window"""
        if not self._close_window_by_title("Facebook"):
            self._speak("Facebook window not found")

    def _close_instagram(self):
        """Close Instagram window"""
        if not self._close_window_by_title("Instagram"):
            self._speak("Instagram window not found")
    
    # ==================== System Commands ====================
    
    def _minimize_window(self):
        """Minimize the active window"""
        try:
            import pyautogui
            pyautogui.keyDown('win')
            pyautogui.press('down')
            pyautogui.keyUp('win')
            print("[Voice] Window minimized")
        except Exception as e:
            print(f"[Voice] Error minimizing window: {e}")
            self._speak("Could not minimize window")
    
    def _lock_pc(self):
        """Lock the PC"""
        try:
            subprocess.Popen(["rundll32.exe", "user32.dll,LockWorkStation"])
            print("[Voice] PC locked")
        except Exception as e:
            print(f"[Voice] Error locking PC: {e}")
            self._speak("Could not lock PC")
    
    def _take_screenshot(self):
        """Take a screenshot"""
        try:
            import pyautogui
            from datetime import datetime
            # Create screenshots folder if it doesn't exist
            screenshots_dir = os.path.join(os.path.expanduser("~"), "Pictures", "Screenshots")
            os.makedirs(screenshots_dir, exist_ok=True)
            
            # Take screenshot
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = os.path.join(screenshots_dir, f"screenshot_{timestamp}.png")
            screenshot = pyautogui.screenshot()
            screenshot.save(filepath)
            print(f"[Voice] Screenshot saved to {filepath}")
        except Exception as e:
            print(f"[Voice] Error taking screenshot: {e}")
            self._speak("Could not take screenshot")
    
    def _tell_time(self):
        """Speak the current time"""
        try:
            now = datetime.now()
            time_string = now.strftime("%I:%M %p")
            response = f"The time is {time_string}"
            self._speak(response)
            print(f"[Voice] {response}")
        except Exception as e:
            print(f"[Voice] Error telling time: {e}")
            self._speak("Could not get the current time")
    
    def _stop_listening_command(self):
        """
        Stop listening command (voice trigger).
        Instead of killing the thread, we switch to STANDBY mode.
        """
        self.mode = "STANDBY"
        print("[Voice] Switching to STANDBY mode")
        self._speak("Voice commands deactivated")


# Singleton instance
_voice_system_instance = None

def get_voice_system():
    """Get or create the singleton voice command system instance"""
    global _voice_system_instance
    if _voice_system_instance is None:
        _voice_system_instance = VoiceCommandSystem()
    return _voice_system_instance
