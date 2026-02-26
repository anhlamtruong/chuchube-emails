"""Template rendering service — migrated from sending_email/template_handler.py"""
import os
import re


def load_template_from_file(template_folder: str, template_file: str) -> tuple[str, str]:
    """Load template from file, split into (subject, body) on '---' separator."""
    template_path = os.path.join(template_folder, template_file)
    with open(template_path, "r", encoding="utf-8") as f:
        full_content = f.read()
    return split_template(full_content)


def split_template(full_content: str) -> tuple[str, str]:
    """Split raw template content into (subject, body) on '---' separator."""
    parts = re.split(r"\s*---\s*", full_content, 1)
    if len(parts) != 2:
        raise ValueError("Template must have 'Subject: ...' then '---' then body.")
    subject = parts[0].replace("Subject: ", "").strip()
    body = parts[1].strip()
    return subject, body


def create_value_prop(framework_type: str, strength: str, audience_value: str) -> str:
    """Creates the correct sentence based on framework type."""
    if not all([framework_type, strength, audience_value]):
        return "I'm very interested in this role and believe my skills are a strong match."

    framework_type = str(framework_type).lower().strip()
    strength = str(strength).strip()
    audience_value = str(audience_value).strip()

    sentences = {
        "passion": f"I'm passionate about {strength} to achieve {audience_value}.",
        "known_for": f"I'm known for my {strength} to achieve {audience_value}.",
        "mission": f"I'm on a mission to {strength} to achieve {audience_value}.",
    }
    return sentences.get(framework_type, f"My experience in {strength} can help achieve {audience_value}.")


def personalize_template(
    subject_template: str,
    body_template: str,
    *,
    recipient_name: str,
    company: str,
    position: str,
    framework: str,
    my_strength: str,
    audience_value: str,
    your_name: str,
    your_phone_number: str,
    your_email: str,
    your_city_and_state: str,
    image_assets_folder: str | None = None,
    template_file_name: str = "",
    **extra_fields,
) -> tuple[str, str, str | None]:
    """Replace all {placeholders} and return (subject, body, image_to_embed)."""
    image_to_embed = None
    dynamic_image_tag = ""

    if template_file_name == "template_shpe_2025_with_picture.html":
        if company and recipient_name and image_assets_folder:
            base_filename = f"{company}_{recipient_name}"
            for ext in [".png", ".jpg", ".jpeg", ".gif"]:
                file_path = os.path.join(image_assets_folder, base_filename + ext)
                if os.path.exists(file_path):
                    image_to_embed = file_path
                    dynamic_image_tag = (
                        f'<img src="cid:my_dynamic_image" '
                        f'alt="{company} Meeting Summary" '
                        f'style="width:100%; max-width:600px;">'
                    )
                    break

    value_prop = create_value_prop(framework, my_strength, audience_value)
    first_name = recipient_name.split()[0] if recipient_name else "there"

    replacements = {
        "name": your_name,
        "first_name": first_name,
        "company": company,
        "position": position,
        "value_prop_sentence": value_prop,
        "your_name": your_name,
        "your_phone_number": your_phone_number,
        "your_email": your_email,
        "your_city_and_state": your_city_and_state,
        "dynamic_image_tag": dynamic_image_tag,
    }

    # Merge custom fields so {custom_key} placeholders work in templates
    if extra_fields:
        replacements.update(extra_fields)

    # SafeDict leaves unknown {placeholders} intact instead of raising KeyError
    class SafeDict(dict):
        def __missing__(self, key):
            return "{" + key + "}"

    safe = SafeDict(replacements)
    final_subject = subject_template.format_map(safe)
    final_body = body_template.format_map(safe)

    return final_subject, final_body, image_to_embed
