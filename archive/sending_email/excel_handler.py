import pandas as pd

def load_recipients(file_path):
    """
    Loads the recipients from the specified Excel file.
    
    Args:
        file_path (str): The path to the .xlsx file.
        
    Returns:
        pd.DataFrame or None: A DataFrame with recipient data, or None on error.
    """
    try:
        column_types = {
            'Sent or Not': str
        }
        df = pd.read_excel(file_path, dtype=column_types)
        return df
    except FileNotFoundError:
        print(f"Error: Could not find the file '{file_path}'.")
        print("Please make sure it's in the same directory.")
        return None
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return None

def save_recipients(df, file_path):
    """
    Saves the updated DataFrame back to the Excel file.
    
    Args:
        df (pd.DataFrame): The DataFrame to save.
        file_path (str): The path to the .xlsx file.
    """
    try:
        df.to_excel(file_path, index=False)
        print(f"\nSuccessfully updated '{file_path}'.")
    except Exception as e:
        print(f"Error saving to Excel: {e}")