import re

with open('webui/js/settings.js', 'r') as f:
    content = f.read()

replacement = """        // If provider changed for chat model, apply default URLs for local providers
        if (field.id === 'chat_model_provider' && this.settings && this.settings.sections) {
            const section = this.settings.sections.find(s => s.fields && s.fields.includes(field));
            if (section) {
                const apiBaseField = section.fields.find(f => f.id === 'chat_model_api_base');
                if (apiBaseField) {
                    if (value === 'lm_studio') {
                        if (!apiBaseField.value || apiBaseField.value.trim() === '') {
                            apiBaseField.value = 'http://localhost:1234/v1';
                        }
                    } else if (value === 'ollama') {
                        if (!apiBaseField.value || apiBaseField.value.trim() === '') {
                            apiBaseField.value = 'http://localhost:11434';
                        }
                    } else {
                        // Clear out the URL if the user switches away from a local provider
                        // and the URL is still set to one of the defaults
                        if (apiBaseField.value === 'http://localhost:1234/v1' || apiBaseField.value === 'http://localhost:11434') {
                            apiBaseField.value = '';
                        }
                    }
                }
            }
        }"""

pattern = re.compile(r"        // If provider changed for chat model, apply default URLs for local providers.*?        }", re.DOTALL)
new_content = pattern.sub(replacement, content)

with open('webui/js/settings.js', 'w') as f:
    f.write(new_content)
