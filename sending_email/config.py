import os
from dotenv import load_dotenv

# Load variables from .env file
load_dotenv()

# --- 1. File Paths ---
EXCEL_FILE = os.getenv('EXCEL_PATH')
TEMPLATE_FOLDER = './sending_email/templates'
IMAGE_FOLDER = './sending_email/assets/selfie'
COMMON_ATTACHMENTS = [
    './sending_email/assets/Certificates.pdf'
]
# --- 2. Your Information ---
# SENDER_EMAIL = os.getenv('SENDER_EMAIL')
YOUR_NAME = os.getenv('YOUR_NAME')
YOUR_PHONE_NUMBER = os.getenv('YOUR_PHONE')
YOUR_STATE_AND_CITY = os.getenv('YOUR_CITY_STATE')
# PASSWORD = os.getenv('SENDER_PASSWORD')

EMAIL_CREDENTIALS = {
    os.getenv('SENDER_EMAIL_1'): os.getenv('SENDER_PASSWORD_1'),
    os.getenv('SENDER_EMAIL_2'): os.getenv('SENDER_PASSWORD_2'),
}
RESUME_MAPPING = {
    os.getenv('SENDER_EMAIL_1'): './sending_email/assets/Lam_Anh_Truong_Resume.pdf',
    os.getenv('SENDER_EMAIL_2'): './sending_email/assets/Alan_Truong_Resume.pdf'
}

# --- 3. SMTP Server Settings ---
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 465  # For SSL