import sys
import os

# Ensure proper import resolution
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from gesture_v3.core.system import SystemController
from gesture_v3.ui.web_launcher import show_web_startup
import eel
import requests
import json

# ----------------------------------------
# ✅ CONFIG
# ----------------------------------------

WEBHOOK_URL = "https://syedaun.app.n8n.cloud/webhook/d770bc62-91e8-4a42-83d3-65a717c2dc11"
# ⚠️ Use PRODUCTION URL (/webhook/) NOT /webhook-test/

# ----------------------------------------
# ✅ CHATBOT FUNCTION
# ----------------------------------------

@eel.expose
def chatbot_query(user_message: str) -> str:
    """
    Sends user message to n8n AI Agent and returns response safely.
    """

    try:
        if not user_message or not user_message.strip():
            return "⚠️ Please enter a valid message."

        payload = {
            "chatInput": user_message,
            "sessionId": "desktop-app-user"   # REQUIRED for memory node
        }

        response = requests.post(
            WEBHOOK_URL,
            json=payload,
            timeout=30
        )

        # Debug log
        print("Status Code:", response.status_code)
        print("Raw Response:", response.text)

        # Check HTTP errors
        if response.status_code != 200:
            return f"⚠️ Server error ({response.status_code}). Check workflow."

        # Try parsing JSON safely
        try:
            data = response.json()
        except json.JSONDecodeError:
            return "⚠️ Invalid response from AI service."

        # ----------------------------------------
        # ✅ HANDLE MULTIPLE RESPONSE FORMATS
        # ----------------------------------------

        # Case 1: { "output": "text" }
        if isinstance(data, dict):
            for key in ["output", "text", "message", "reply", "response"]:
                if key in data and data[key]:
                    return str(data[key])

        # Case 2: [ { "output": "text" } ]
        if isinstance(data, list) and len(data) > 0:
            first = data[0]
            if isinstance(first, dict):
                for key in ["output", "text", "message", "reply", "response"]:
                    if key in first and first[key]:
                        return str(first[key])
            return str(first)

        # Fallback
        return "⚠️ No valid response received from AI."

    except requests.exceptions.Timeout:
        return "⏱️ The assistant is taking too long. Please try again."

    except requests.exceptions.ConnectionError:
        return "🔌 Cannot connect to AI service. Make sure n8n is running."

    except Exception as e:
        print("chatbot_query error:", str(e))
        return f"⚠️ Unexpected error: {str(e)}"
# -------------------------------
# ✅ MAIN ENTRY
# -------------------------------
if __name__ == "__main__":

    # Start UI
    eel_or_choice = show_web_startup()

    # If running in EEL mode
    if eel_or_choice == eel:
        print("Waiting for user to start...")

        from gesture_v3.ui import web_launcher

        # Wait for user action
        while web_launcher.user_choice is None:
            eel.sleep(0.1)

        if web_launcher.user_choice:
            print("🚀 Starting gesture control system...")

            app = SystemController()

            # Update UI status
            try:
                eel.set_activation_status("Gesture Control Activated")()
            except Exception as e:
                print(f"UI update failed: {e}")

            app.run()

        else:
            print("❌ Gesture control cancelled by user.")

    # Console fallback
    elif eel_or_choice:
        print("🚀 Starting gesture control system...")
        app = SystemController()
        app.run()

    else:
        print("❌ Gesture control cancelled by user.")