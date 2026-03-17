# main.py
import time
import pandas as pd # Make sure to import pandas here for sorting
from sending_email import config
from sending_email import excel_handler
from sending_email import template_handler
from sending_email import email_sender

def main():
    print(f"--- Starting Email Sender ---")
    
    # --- 1. LOAD EXCEL DATA ---
    df = excel_handler.load_recipients(config.EXCEL_FILE)
    if df is None:
        print("Exiting program.")
        return

    # --- 2. PREPARE GROUPS ---
    # We sort the DataFrame by 'Sender Email' so we can batch the sending
    # If 'Sender Email' is missing, fill it with a default or raise error
    if 'Sender Email' not in df.columns:
        print("Error: Column 'Sender Email' missing in Excel.")
        return

    # Filter out already sent rows to avoid confusion during sorting
    # (Optional: depends on if you want to see 'Skipped' logs for them)
    
    df_sorted = df.sort_values(by='Sender Email')

    current_sender_email = None
    server = None
    emails_sent_count = 0

    try:
        for index, row in df_sorted.iterrows():
            # Check skip condition
            if str(row.get('Sent or Not', '')).lower() in ['sent', 'response']:
                print(f"  [SKIPPED] Email for {row.get('Name')} already processed.")
                continue

            # --- 3. DYNAMIC LOGIN LOGIC ---
            required_sender = row.get('Sender Email')
            
            # If we are not connected, or the sender has changed, we need to switch accounts
            if required_sender != current_sender_email:
                # Close old connection if exists
                if server:
                    server.quit()
                    print(f"Logged out of {current_sender_email}")
                
                # Get password for new sender
                password = config.EMAIL_CREDENTIALS.get(required_sender)
                if not password:
                    print(f"  [ERROR] No password found in config for {required_sender}. Skipping.")
                    current_sender_email = None # Reset
                    server = None
                    continue

                # Connect to new server
                print(f"Logging in as {required_sender}...")
                server = email_sender.login_to_server(
                    config.SMTP_SERVER, 
                    config.SMTP_PORT, 
                    required_sender, 
                    password
                )
                
                if server is None:
                    print(f"  [ERROR] Could not login to {required_sender}. Skipping.")
                    current_sender_email = None
                    continue
                
                current_sender_email = required_sender

            # If server failed to connect above, skip this row
            if server is None:
                continue
            files_to_send = config.COMMON_ATTACHMENTS.copy()
            
            #Find the specific resume for this sender
            resume_path = config.RESUME_MAPPING.get(current_sender_email)
            if resume_path:
                files_to_send.insert(0, resume_path) # Add resume to the front
            else:
                print(f"  [WARNING] No resume defined for {current_sender_email}")

            # --- 4. PREPARE AND SEND ---
            template_file = row.get('Template File')
            if not template_file:
                print(f"  [SKIPPED] No template file for {row.get('Name')}.")
                continue

            # Load Template
            subject_template, body_template = template_handler.load_template(
                config.TEMPLATE_FOLDER, 
                template_file
            )
            
            # Personalize
            # Note: We pass 'current_sender_email' as the sender
            subject, body, image_to_embed = template_handler.personalize_template(
                subject_template, 
                body_template, 
                row, 
                config.YOUR_NAME,
                config.YOUR_PHONE_NUMBER, 
                current_sender_email, # Updated to use dynamic sender
                config.YOUR_STATE_AND_CITY,
                config.IMAGE_FOLDER,
                template_file
            )
            
            recipient_email = row.get('Email')
            
            # Send
            success = email_sender.send_email(
                server, 
                current_sender_email, # Updated to use dynamic sender
                recipient_email, 
                subject, 
                body,
                attachment_paths=files_to_send,
                inline_image_path=image_to_embed,
            )
            
            if success:
                print(f"[SUCCESS] Email sent to {row.get('Name')} - {row.get('Email')} from {current_sender_email}; Company: {row.get('Companies')}")
                # Update the ORIGINAL dataframe (df) not the sorted copy, using the index
                df.at[index, 'Sent or Not'] = 'Sent'
                emails_sent_count += 1
                time.sleep(2)

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if server:
            server.quit()
            print("Logged out.")
        
        if emails_sent_count > 0:
            # Save the original DF which we updated using index
            excel_handler.save_recipients(df, config.EXCEL_FILE)
        else:
            print("No new emails sent.")

if __name__ == '__main__':
    main()