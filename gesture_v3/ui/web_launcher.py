"""
Web-based Startup UI Launcher
Uses eel to create a modern web interface for J.A.R.V.I.S Gesture Control
"""

import eel
import os
import sys

# Global variable to store user choice
user_choice = None


def show_web_startup():
    """
    Launch the web-based startup UI and wait for user decision.
    
    Returns:
        bool: True if user clicked Start, False if cancelled
    """
    global user_choice
    user_choice = None
    
    # Get the web UI directory path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    web_folder = os.path.join(project_root, 'web_ui')
    
    # Initialize eel with the web folder
    eel.init(web_folder)
    
    # Expose Python functions to JavaScript
    @eel.expose
    def start_gesture_control():
        """Called when user clicks the START button"""
        global user_choice
        user_choice = True
        # Do NOT close the window here. We want to keep it open.
        # We also don't exit the process here.
        # The main_v3.py loop will detect user_choice=True and proceed.
    
    @eel.expose
    def cancel_startup():
        """Called when user presses ESC or closes window"""
        global user_choice
        user_choice = False
        import sys
        sys.exit(0)
    
    @eel.expose
    def activate_voice_commands():
        """Called when user clicks the Voice Commands button"""
        try:
            from gesture_v3.voice.voice_commands import get_voice_system
            voice_system = get_voice_system()
            success = voice_system.start_listening()
            if success:
                print("[Web UI] Voice commands activated successfully")
            else:
                print("[Web UI] Failed to activate voice commands")
        except Exception as e:
            print(f"[Web UI] Error activating voice commands: {e}")
            import traceback
            traceback.print_exc()

    def on_close(page, sockets):
        """Called when window is closed"""
        global user_choice
        if user_choice is None:
            user_choice = False
            # If user closes window without starting, we should probably exit
            import sys
            sys.exit(0)
    
    # Start the eel app in non-blocking mode
    try:
        eel.start('index.html', 
                  mode='chrome',
                  size=(1400, 800),
                  position=(100, 50),
                  close_callback=on_close,
                  block=False) # Non-blocking mode
    except (SystemExit, KeyboardInterrupt):
        pass
    except Exception as e:
        print(f"Error launching web UI: {e}")
        # Fallback to simple console prompt
        response = input("Start J.A.R.V.I.S Gesture Control? (y/n): ")
        user_choice = response.lower() in ['y', 'yes']
        return user_choice

    # Wait loop logic is moved to main_v3.py or handled by returning the eel instance
    return eel



if __name__ == "__main__":
    # Test the web UI
    result = show_web_startup()
    print(f"User choice: {'Start' if result else 'Cancel'}")