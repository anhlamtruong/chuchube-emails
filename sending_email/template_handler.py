import os
import re


def safe_substitute(template: str, replacements: dict) -> str:
    """Replace {placeholder} tokens using regex so CSS braces are left alone."""
    def _replacer(m: re.Match) -> str:
        key = m.group(1)
        return str(replacements.get(key, m.group(0)))
    return re.sub(r"\{(\w+)\}", _replacer, template)


def load_template(template_folder, template_file):
    """
    Loads a template file and splits it into subject and body.
    
    Args:
        template_folder (str): The path to the 'templates' directory.
        template_file (str): The filename of the template (e.g., 'template.txt')
        
    Returns:
        (str, str) or (None, None): A tuple of (subject, body), or (None, None) on error.
    """
    try:
        template_path = os.path.join(template_folder, template_file)
        with open(template_path, 'r', encoding='utf-8') as f:
            full_content = f.read()
        
        # Split subject and body, separated by '---'
        # parts = full_content.split('\n---\n', 1)
        
        parts = re.split(r'\s*---\s*', full_content, 1)
        if len(parts) != 2:
            print(f"Error: Template '{template_file}' is not formatted correctly.")
            print("It must have a 'Subject: ...' line, then '---', then the body.")
            return None, None
            
        subject = parts[0].replace('Subject: ', '').strip()
        body = parts[1].strip()
        return subject, body
        
    except FileNotFoundError:
        print(f"Error: Template file not found: {template_path}")
        return None, None
    except Exception as e:
        print(f"Error loading template '{template_file}': {e}")
        return None, None

def create_value_prop(framework_type, strength, audience_value):
    """Creates the correct sentence based on the 'Framework' column."""
    
    # Handle empty or invalid data
    if not all([framework_type, strength, audience_value]):
        return "I'm very interested in this role and believe my skills are a strong match."

    framework_type = str(framework_type).lower()
    strength = str(strength)
    audience_value = str(audience_value)

    if framework_type == 'passion':
        return f"I'm passionate about {strength} to achieve {audience_value}."
    elif framework_type == 'known_for':
        return f"I'm known for my {strength} to achieve {audience_value}."
    elif framework_type == 'mission':
        return f"I'm on a mission to {strength} to achieve {audience_value}."
    else:
        # A fallback in case the 'Framework' column is empty or has a typo
        return f"My experience in {strength} can help achieve {audience_value}."

def personalize_template(subject_template, body_template, row_data, your_name, your_phone_number, your_email, your_city_and_state, image_assets_folder, template_file_name):
    """
    Replaces all placeholders in the subject and body with data from the row.
    
    Args:
        subject_template (str): The raw subject line (e.g., "Subject for {company}")
        body_template (str): The raw body text.
        row_data (pd.Series): A row from the DataFrame.
        your_name (str): The sender's name.
        
    Returns:
        (str, str): A tuple of (personalized_subject, personalized_body,image_assets_folder).
    """
    # --- 1. Find the dynamic image ---
    image_to_embed = None
    dynamic_image_tag = ""
    company = row_data.get('Companies', '')
    name = row_data.get('Name', '')

    if template_file_name == 'template_shpe_2025_with_picture.html':
        if company and name and image_assets_folder:
            base_filename = f"{company}_{name}"
            for ext in ['.png', '.jpg', '.jpeg', '.gif']:
                file_path = os.path.join(image_assets_folder, base_filename + ext)
                if os.path.exists(file_path):
                    image_to_embed = file_path
                    # This 'cid' MUST match the 'cid' in email_sender.py
                    dynamic_image_tag = f'<img src="cid:my_dynamic_image" alt="{company} Meeting Summary" style="width:100%; max-width:600px;">'
                    break
    
    # Create the value prop sentence
    value_prop = create_value_prop(
        row_data.get('Framework'),
        row_data.get('my strength'),
        row_data.get('something my target audience values')
    )
    
    # Get first name, fallback to full name
    full_name = row_data.get('Name', '')
    first_name = full_name.split()[0] if full_name else "there"

    # Create a dictionary of all possible placeholders
    replacements = {
        'name': your_name,
        'first_name': first_name,
        'company': row_data.get('Companies', ''),
        'position': row_data.get('Positions', ''),
        'value_prop_sentence': value_prop,
        'your_name': your_name,
        'your_phone_number': your_phone_number,
        'your_email': your_email,
        'your_city_and_state': your_city_and_state,
        'dynamic_image_tag': dynamic_image_tag
    }
    
    
    final_subject = safe_substitute(subject_template, replacements)
    final_body = safe_substitute(body_template, replacements)
    
    return final_subject, final_body, image_to_embed