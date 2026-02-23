import pytest
from unittest.mock import patch, MagicMock
import sys
import os

# Add the parent directory to sys.path to import client
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from client import KeyboardController, on_keystroke

class TestKeyboardController:
    
    @patch('pyautogui.write')
    def test_type_text(self, mock_write):
        KeyboardController.type_text("hello world")
        mock_write.assert_called_once_with("hello world")

    @patch('pyautogui.write')
    def test_press_key_single_char(self, mock_write):
        KeyboardController.press_key("a")
        mock_write.assert_called_once_with("a")

    @patch('pyautogui.press')
    def test_press_key_special_char(self, mock_press):
        KeyboardController.press_key("Enter")
        mock_press.assert_called_once_with("enter")

    @patch('pyautogui.press')
    def test_press_key_backspace(self, mock_press):
        KeyboardController.press_key("Backspace")
        mock_press.assert_called_once_with("backspace")

class TestSocketEvents:
    
    @patch('client.KeyboardController.press_key')
    def test_on_keystroke_letter(self, mock_press_key):
        data = {'type': 'letter', 'payload': 'x'}
        on_keystroke(data)
        mock_press_key.assert_called_once_with('x')

    @patch('client.KeyboardController.type_text')
    def test_on_keystroke_word(self, mock_type_text):
        data = {'type': 'word', 'payload': 'hello '}
        on_keystroke(data)
        mock_type_text.assert_called_once_with('hello ')

    @patch('client.KeyboardController.type_text')
    def test_on_keystroke_block(self, mock_type_text):
        data = {'type': 'block', 'payload': 'This is a full sentence.'}
        on_keystroke(data)
        mock_type_text.assert_called_once_with('This is a full sentence.')
