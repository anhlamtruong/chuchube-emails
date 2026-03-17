import smtplib
import ssl
import os
import mimetypes
from email.message import EmailMessage

# --- login_to_server function (No changes needed) ---
def login_to_server(smtp_server, port, sender_email, password):
    """
    Logs into the SMTP server and returns the server object.
    ...
    """
    context = ssl.create_default_context()
    try:
        server = smtplib.SMTP_SSL(smtp_server, port, context=context)
        server.login(sender_email, password)
        print("SMTP login successful.")
        return server
    except smtplib.SMTPAuthenticationError:
        print("\n--- LOGIN FAILED ---")
        print("Authentication error. Check your email or password.")
        print("If using Gmail, make sure you're using an 'App Password'.")
        return None
    except Exception as e:
        print(f"Error connecting to SMTP server: {e}")
        return None

# --- CORRECTED FUNCTION ---
def send_email(server, sender_email, recipient_email, subject, body, attachment_paths=None, inline_image_path=None):
    """
    Sends a single email using the active server connection.
    ...
    """
    try:
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = sender_email
        msg['To'] = recipient_email

        
        # 1. ADD INLINE IMAGE (RELATED) FIRST
        if inline_image_path and os.path.exists(inline_image_path):
            with open(inline_image_path, 'rb') as f:
                img_data = f.read()
            
            img_subtype = mimetypes.guess_type(inline_image_path)[0].split('/')[1]
            msg.add_related(img_data, maintype='image', subtype=img_subtype, cid='my_dynamic_image')
            
        # 2. ADD HTML BODY (ALTERNATIVE) SECOND
        msg.add_alternative(body, subtype='html')

        # 3. ADD ATTACHMENTS (MIXED) LAST
        if attachment_paths:
            for path in attachment_paths:
                if path and os.path.exists(path):
                    # Guess the MIME type
                    ctype, encoding = mimetypes.guess_type(path)
                    if ctype is None or encoding is not None:
                        ctype = 'application/octet-stream'  # Default if guess fails
                    
                    maintype, subtype = ctype.split('/', 1)
                    
                    with open(path, 'rb') as f:
                        msg.add_attachment(f.read(),
                                           maintype=maintype,
                                           subtype=subtype,
                                           filename=os.path.basename(path))
                        
        

        server.send_message(msg)
        return True
    except Exception as e:
        print(f"  [FAILED] to send to {recipient_email}: {e}")
        return False