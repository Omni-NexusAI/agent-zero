const settingsModalProxy = {
    isOpen: false,
    settings: {},
    resolvePromise: null,
    activeTab: 'agent', // Default tab
    provider: 'cloudflared',

    // Computed property for filtered sections
    get filteredSections() {
        if (!this.settings || !this.settings.sections) return [];
        const filteredSections = this.settings.sections.filter(section => section.tab === this.activeTab);

        // If no sections match the current tab (or all tabs are missing), show all sections
        if (filteredSections.length === 0) {
            return this.settings.sections;
        }

        return filteredSections;
    },

    // Switch tab method
    switchTab(tabName) {
        // Update our component state
        this.activeTab = tabName;

        // Update the store safely
        const store = Alpine.store('root');
        if (store) {
            store.activeTab = tabName;
        }

        localStorage.setItem('settingsActiveTab', tabName);

        // Auto-scroll active tab into view after a short delay to ensure DOM updates
        setTimeout(() => {
            const activeTab = document.querySelector('.settings-tab.active');
            if (activeTab) {
                activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }

            // When switching to the scheduler tab, initialize Flatpickr components
            if (tabName === 'scheduler') {
                console.log('Switching to scheduler tab, initializing Flatpickr');
                const schedulerElement = document.querySelector('[x-data="schedulerSettings"]');
                if (schedulerElement) {
                    const schedulerData = Alpine.$data(schedulerElement);
                    if (schedulerData) {
                        // Start polling
                        if (typeof schedulerData.startPolling === 'function') {
                            schedulerData.startPolling();
                        }

                        // Initialize Flatpickr if editing or creating
                        if (typeof schedulerData.initFlatpickr === 'function') {
                            // Check if we're creating or editing and initialize accordingly
                            if (schedulerData.isCreating) {
                                schedulerData.initFlatpickr('create');
                            } else if (schedulerData.isEditing) {
                                schedulerData.initFlatpickr('edit');
                            }
                        }

                        // Force an immediate fetch
                        if (typeof schedulerData.fetchTasks === 'function') {
                            schedulerData.fetchTasks();
                        }
                    }
                }
            }
        }, 10);
    },

    // Initialize model picker reactive flags for dropdown/history
    initializeModelFieldDropdowns(sections) {
        if (!sections) return;
        sections.forEach(section => {
            if (!section.fields) return;
            section.fields.forEach(field => {
                if (field.type === 'text' && (
                    (field.id && (field.id.endsWith('_model_name') ||
                     field.id === 'chat_model_name' ||
                     field.id === 'util_model_name' ||
                     field.id === 'browser_model_name' ||
                     field.id === 'embed_model_name'))
                )) {
                    if (!Object.prototype.hasOwnProperty.call(field, 'showDropdown')) {
                        field.showDropdown = false;
                    }
                    if (!Object.prototype.hasOwnProperty.call(field, 'historyNonce')) {
                        field.historyNonce = 0;
                    }
                }
            });
        });
    },

    async openModal() {
        console.log('Settings modal opening');
        const modalEl = document.getElementById('settingsModal');
        const modalAD = Alpine.$data(modalEl);

        // First, ensure the store is updated properly
        const store = Alpine.store('root');
        if (store) {
            // Set isOpen first to ensure proper state
            store.isOpen = true;
        }

        //get settings from backend
        try {
            const set = await sendJsonData("/settings_get", null);

            // First load the settings data without setting the active tab
            const settings = {
                "title": "Settings",
                "buttons": [
                    {
                        "id": "save",
                        "title": "Save",
                        "classes": "btn btn-ok"
                    },
                    {
                        "id": "cancel",
                        "title": "Cancel",
                        "type": "secondary",
                        "classes": "btn btn-cancel"
                    }
                ],
                "sections": set.settings.sections
            }

            // Initialize model picker dropdown flags before wiring to modal
            this.initializeModelFieldDropdowns(settings.sections);

            // Update modal data
            modalAD.isOpen = true;
            modalAD.settings = settings;

            // Now set the active tab after the modal is open
            // This ensures Alpine reactivity works as expected
            setTimeout(() => {
                // Get stored tab or default to 'agent'
                const savedTab = localStorage.getItem('settingsActiveTab') || 'agent';
                console.log(`Setting initial tab to: ${savedTab}`);

                // Directly set the active tab
                modalAD.activeTab = savedTab;

                // Also update the store
                if (store) {
                    store.activeTab = savedTab;
                }

                localStorage.setItem('settingsActiveTab', savedTab);

                // Add a small delay *after* setting the tab to ensure scrolling works
                setTimeout(() => {
                    const activeTabElement = document.querySelector('.settings-tab.active');
                    if (activeTabElement) {
                        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                    // Debug log
                    const schedulerTab = document.querySelector('.settings-tab[title="Task Scheduler"]');
                    console.log(`Current active tab after direct set: ${modalAD.activeTab}`);
                    console.log('Scheduler tab active after direct initialization?',
                        schedulerTab && schedulerTab.classList.contains('active'));

                    // Explicitly start polling if we're on the scheduler tab
                    if (modalAD.activeTab === 'scheduler') {
                        console.log('Settings opened directly to scheduler tab, initializing polling');
                        const schedulerElement = document.querySelector('[x-data="schedulerSettings"]');
                        if (schedulerElement) {
                            const schedulerData = Alpine.$data(schedulerElement);
                            if (schedulerData && typeof schedulerData.startPolling === 'function') {
                                schedulerData.startPolling();
                                // Also force an immediate fetch
                                if (typeof schedulerData.fetchTasks === 'function') {
                                    schedulerData.fetchTasks();
                                }
                            }
                        }
                    }
                }, 10); // Small delay just for scrolling

            }, 5); // Keep a minimal delay for modal opening reactivity

            // Add a watcher to disable the Save button when a task is being created or edited
            const schedulerComponent = document.querySelector('[x-data="schedulerSettings"]');
            if (schedulerComponent) {
                // Watch for changes to the scheduler's editing state
                const checkSchedulerEditingState = () => {
                    const schedulerData = Alpine.$data(schedulerComponent);
                    if (schedulerData) {
                        // If we're on the scheduler tab and creating/editing a task, disable the Save button
                        const saveButton = document.querySelector('.modal-footer button.btn-ok');
                        if (saveButton && modalAD.activeTab === 'scheduler' &&
                            (schedulerData.isCreating || schedulerData.isEditing)) {
                            saveButton.disabled = true;
                            saveButton.classList.add('btn-disabled');
                        } else if (saveButton) {
                            saveButton.disabled = false;
                            saveButton.classList.remove('btn-disabled');
                        }
                    }
                };

                // Add a mutation observer to detect changes in the scheduler component's state
                const observer = new MutationObserver(checkSchedulerEditingState);
                observer.observe(schedulerComponent, { attributes: true, subtree: true, childList: true });

                // Also watch for tab changes to update button state
                modalAD.$watch('activeTab', checkSchedulerEditingState);

                // Initial check
                setTimeout(checkSchedulerEditingState, 100);
            }

            return new Promise(resolve => {
                this.resolvePromise = resolve;
            });

        } catch (e) {
            window.toastFetchError("Error getting settings", e)
        }
    },

    async handleButton(buttonId) {
        if (buttonId === 'save') {

            const modalEl = document.getElementById('settingsModal');
            const modalAD = Alpine.$data(modalEl);
            try {
                // Persist any staged model names to localStorage before saving
                try {
                    cacheAllModelNames(modalAD.settings.sections);
                } catch (cacheErr) {
                    console.warn('cacheAllModelNames failed:', cacheErr);
                }
                resp = await window.sendJsonData("/settings_set", modalAD.settings);
            } catch (e) {
                window.toastFetchError("Error saving settings", e)
                return
            }
            document.dispatchEvent(new CustomEvent('settings-updated', { detail: resp.settings }));
            this.resolvePromise({
                status: 'saved',
                data: resp.settings
            });
        } else if (buttonId === 'cancel') {
            this.handleCancel();
        }

        // Stop scheduler polling if it's running
        this.stopSchedulerPolling();

        // First update our component state
        this.isOpen = false;

        // Then safely update the store
        const store = Alpine.store('root');
        if (store) {
            // Use a slight delay to avoid reactivity issues
            setTimeout(() => {
                store.isOpen = false;
            }, 10);
        }
    },

    async handleCancel() {
        this.resolvePromise({
            status: 'cancelled',
            data: null
        });

        // Stop scheduler polling if it's running
        this.stopSchedulerPolling();

        // First update our component state
        this.isOpen = false;

        // Then safely update the store
        const store = Alpine.store('root');
        if (store) {
            // Use a slight delay to avoid reactivity issues
            setTimeout(() => {
                store.isOpen = false;
            }, 10);
        }
    },

    // Add a helper method to stop scheduler polling
    stopSchedulerPolling() {
        // Find the scheduler component and stop polling if it exists
        const schedulerElement = document.querySelector('[x-data="schedulerSettings"]');
        if (schedulerElement) {
            const schedulerData = Alpine.$data(schedulerElement);
            if (schedulerData && typeof schedulerData.stopPolling === 'function') {
                console.log('Stopping scheduler polling on modal close');
                schedulerData.stopPolling();
            }
        }
    },

    async handleFieldButton(field) {
        console.log(`Button clicked: ${field.id}`);

        if (field.id === "mcp_servers_config") {
            openModal("settings/mcp/client/mcp-servers.html");
        } else if (field.id === "backup_create") {
            openModal("settings/backup/backup.html");
        } else if (field.id === "backup_restore") {
            openModal("settings/backup/restore.html");
        } else if (field.id === "show_a2a_connection") {
            openModal("settings/external/a2a-connection.html");
        } else if (field.id === "external_api_examples") {
            openModal("settings/external/api-examples.html");
        } else if (field.id === "memory_dashboard") {
            openModal("settings/memory/memory-dashboard.html");
        }
    }
};


// function initSettingsModal() {

//     window.openSettings = function () {
//         proxy.openModal().then(result => {
//             console.log(result);  // This will log the result when the modal is closed
//         });
//     }

//     return proxy
// }


// document.addEventListener('alpine:init', () => {
//     Alpine.store('settingsModal', initSettingsModal());
// });

document.addEventListener('alpine:init', function () {
    // Initialize the root store first to ensure it exists before components try to access it
    Alpine.store('root', {
        activeTab: localStorage.getItem('settingsActiveTab') || 'agent',
        isOpen: false,

        toggleSettings() {
            this.isOpen = !this.isOpen;
        }
    });

    // Then initialize other Alpine components
    Alpine.data('settingsModal', function () {
        return {
            settingsData: {},
            filteredSections: [],
            activeTab: 'agent',
            isLoading: true,

            async init() {
                // Initialize with the store value
                this.activeTab = Alpine.store('root').activeTab || 'agent';

                // Watch store tab changes
                this.$watch('$store.root.activeTab', (newTab) => {
                    if (typeof newTab !== 'undefined') {
                        this.activeTab = newTab;
                        localStorage.setItem('settingsActiveTab', newTab);
                        this.updateFilteredSections();
                    }
                });

                // Load settings
                await this.fetchSettings();
                // Ensure model fields have reactive flags
                this.initializeModelFields();
                this.updateFilteredSections();
            },

            initializeModelFields() {
                if (!this.settingsData.sections) return;
                this.settingsData.sections.forEach(section => {
                    if (!section.fields) return;
                    section.fields.forEach(field => {
                        if (field.type === 'text' && (
                            (field.id && (field.id.endsWith('_model_name') ||
                             field.id === 'chat_model_name' ||
                             field.id === 'util_model_name' ||
                             field.id === 'browser_model_name' ||
                             field.id === 'embed_model_name'))
                        )) {
                            field.showDropdown = false;
                            if (!Object.prototype.hasOwnProperty.call(field, 'historyNonce')) {
                                field.historyNonce = 0;
                            }
                        }
                    });
                });
            },

            switchTab(tab) {
                // Update our component state
                this.activeTab = tab;

                // Update the store safely
                const store = Alpine.store('root');
                if (store) {
                    store.activeTab = tab;
                }
            },

            async fetchSettings() {
                try {
                    this.isLoading = true;
                    const response = await fetchApi('/api/settings_get', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.settings) {
                            this.settingsData = data.settings;
                        } else {
                            console.error('Invalid settings data format');
                        }
                    } else {
                        console.error('Failed to fetch settings:', response.statusText);
                    }
                } catch (error) {
                    console.error('Error fetching settings:', error);
                } finally {
                    this.isLoading = false;
                }
            },

            updateFilteredSections() {
                // Filter sections based on active tab
                if (this.activeTab === 'agent') {
                    this.filteredSections = this.settingsData.sections?.filter(section =>
                        section.tab === 'agent'
                    ) || [];
                } else if (this.activeTab === 'external') {
                    this.filteredSections = this.settingsData.sections?.filter(section =>
                        section.tab === 'external'
                    ) || [];
                } else if (this.activeTab === 'developer') {
                    this.filteredSections = this.settingsData.sections?.filter(section =>
                        section.tab === 'developer'
                    ) || [];
                } else if (this.activeTab === 'mcp') {
                    this.filteredSections = this.settingsData.sections?.filter(section =>
                        section.tab === 'mcp'
                    ) || [];
                } else if (this.activeTab === 'backup') {
                    this.filteredSections = this.settingsData.sections?.filter(section =>
                        section.tab === 'backup'
                    ) || [];
                } else {
                    // For any other tab, show nothing since those tabs have custom UI
                    this.filteredSections = [];
                }
            },

            async saveSettings() {
                try {
                    // First validate
                    for (const section of this.settingsData.sections) {
                        for (const field of section.fields) {
                            if (field.required && (!field.value || field.value.trim() === '')) {
                                showToast(`${field.title} in ${section.title} is required`, 'error');
                                return;
                            }
                        }
                    }

                    // Prepare data
                    const formData = {};
                    for (const section of this.settingsData.sections) {
                        for (const field of section.fields) {
                            formData[field.id] = field.value;
                        }
                    }

                    // Send request
                    const response = await fetchApi('/api/settings_save', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });

                    if (response.ok) {
                        showToast('Settings saved successfully', 'success');
                        // Refresh settings
                        await this.fetchSettings();
                    } else {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to save settings');
                    }
                } catch (error) {
                    console.error('Error saving settings:', error);
                    showToast('Failed to save settings: ' + error.message, 'error');
                }
            },

            // Handle special button field actions
            handleFieldButton(field) {
                if (field.action === 'test_connection') {
                    this.testConnection(field);
                } else if (field.action === 'reveal_token') {
                    this.revealToken(field);
                } else if (field.action === 'generate_token') {
                    this.generateToken(field);
                } else {
                    console.warn('Unknown button action:', field.action);
                }
            },

            // Test API connection
            async testConnection(field) {
                try {
                    field.testResult = 'Testing...';
                    field.testStatus = 'loading';

                    // Find the API key field
                    let apiKey = '';
                    for (const section of this.settingsData.sections) {
                        for (const f of section.fields) {
                            if (f.id === field.target) {
                                apiKey = f.value;
                                break;
                            }
                        }
                    }

                    if (!apiKey) {
                        throw new Error('API key is required');
                    }

                    // Send test request
                    const response = await fetchApi('/api/test_connection', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            service: field.service,
                            api_key: apiKey
                        })
                    });

                    const data = await response.json();

                    if (response.ok && data.success) {
                        field.testResult = 'Connection successful!';
                        field.testStatus = 'success';
                    } else {
                        throw new Error(data.error || 'Connection failed');
                    }
                } catch (error) {
                    console.error('Connection test failed:', error);
                    field.testResult = `Failed: ${error.message}`;
                    field.testStatus = 'error';
                }
            },

            // Reveal token temporarily
            revealToken(field) {
                // Find target field
                for (const section of this.settingsData.sections) {
                    for (const f of section.fields) {
                        if (f.id === field.target) {
                            // Toggle field type
                            f.type = f.type === 'password' ? 'text' : 'password';

                            // Update button text
                            field.value = f.type === 'password' ? 'Show' : 'Hide';

                            break;
                        }
                    }
                }
            },

            // Generate random token
            generateToken(field) {
                // Find target field
                for (const section of this.settingsData.sections) {
                    for (const f of section.fields) {
                        if (f.id === field.target) {
                            // Generate random token
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            let token = '';
                            for (let i = 0; i < 32; i++) {
                                token += chars.charAt(Math.floor(Math.random() * chars.length));
                            }

                            // Set field value
                            f.value = token;
                            break;
                        }
                    }
                }
            },

            closeModal() {
                // Stop scheduler polling before closing the modal
                const schedulerElement = document.querySelector('[x-data="schedulerSettings"]');
                if (schedulerElement) {
                    const schedulerData = Alpine.$data(schedulerElement);
                    if (schedulerData && typeof schedulerData.stopPolling === 'function') {
                        console.log('Stopping scheduler polling on modal close');
                        schedulerData.stopPolling();
                    }
                }

                this.$store.root.isOpen = false;
            }
        };
    });
});

// Model name caching functions for Model Picker feature
// Get temp models that were staged via Enter but not yet saved
function getTempModels(field) {
    return field?._tempModels || [];
}

// Get local model history from localStorage
function getLocalModelHistory(field) {
    const key = `model_history_${field.id}`;
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : [];
}

// Get all cached model names (local history + temp staged models)
function getCachedModelNames(field) {
    // Read reactive nonce to make Alpine re-evaluate when it changes
    // eslint-disable-next-line no-unused-vars
    const _nonce = field?.historyNonce;
    const local = getLocalModelHistory(field);
    const temp = getTempModels(field);
    return [...new Set([...temp, ...local])];
}

function cacheModelName(field) {
    const value = field.value?.trim();
    if (!value) return;
    
    const key = `model_history_${field.id}`;
    const cached = getLocalModelHistory(field);
    
    // Remove if already exists to avoid duplicates
    const filtered = cached.filter(name => name !== value);
    
    // Add to beginning of list
    filtered.unshift(value);
    
    // Keep only last 20 models
    const limited = filtered.slice(0, 20);
    
    localStorage.setItem(key, JSON.stringify(limited));
}

function removeModelName(field, modelName) {
    // Prefer explicit id; if missing, try infer from active input
    let fieldId = field?.id;
    if (!fieldId) {
        try {
            const wrapper = document.activeElement?.closest?.('.model-name-wrapper');
            const input = wrapper ? wrapper.querySelector('input') : null;
            fieldId = input?.id || fieldId;
        } catch {}
    }
    if (!fieldId) return;

    const currentValue = field?.value?.trim();
    const targetValue = modelName || currentValue;

    // Remove from temp staged models
    if (field._tempModels) {
        field._tempModels = field._tempModels.filter(name => name !== targetValue);
    }

    // Remove from localStorage history immediately
    const key = `model_history_${fieldId}`;
    const cached = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = cached.filter(name => name !== targetValue);
    localStorage.setItem(key, JSON.stringify(filtered));

    // Trigger reactive refresh
    try {
        field.historyNonce = (field.historyNonce || 0) + 1;
    } catch {}

    // Clear the field if it matches removed value and propagate input
    if (field && currentValue === targetValue) {
        field.value = '';
        const inputElement = document.getElementById(fieldId);
        if (inputElement) {
            inputElement.value = '';
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}

function handleFieldInput(field, value) {
    // Just update; staging/persisting handled on Enter/Save
    field.value = value;
}

function toggleModelDropdown(field) {
    // Close all other dropdowns first
    document.querySelectorAll('.model-dropdown').forEach(dropdown => {
        const wrapper = dropdown.closest('.model-name-wrapper');
        if (wrapper) {
            const input = wrapper.querySelector('input');
            if (input && input.id !== field.id) {
                const fieldData = Alpine.$data(input);
                if (fieldData) {
                    fieldData.showDropdown = false;
                }
            }
        }
    });
    
    // Toggle current dropdown
    field.showDropdown = !field.showDropdown;
}

function selectModelName(field, modelName) {
    field.value = modelName;
    field.showDropdown = false;
    // Do not cache here; caching occurs on Save
}

function saveModelName(field) {
    const value = field.value?.trim();
    if (!value) return;
    if (!field._tempModels) field._tempModels = [];
    if (!field._tempModels.includes(value)) {
        field._tempModels.unshift(value);
    }
    field.historyNonce = (field.historyNonce || 0) + 1;
    field.value = '';
    if (field.showDropdown) field.showDropdown = false;
}

// Persist all model names from all fields to localStorage
function cacheAllModelNames(sections) {
    if (!sections) return;
    sections.forEach(section => {
        if (!section.fields) return;
        section.fields.forEach(field => {
            if (field.type === 'text' && (
                field.id && (field.id.endsWith('_model_name') ||
                field.id === 'chat_model_name' ||
                field.id === 'util_model_name' ||
                field.id === 'browser_model_name' ||
                field.id === 'embed_model_name'))
            ) {
                const valuesToCache = [];
                if (field._tempModels && field._tempModels.length > 0) {
                    valuesToCache.push(...field._tempModels);
                }
                if (field.value && field.value.trim()) {
                    valuesToCache.push(field.value.trim());
                }
                valuesToCache.forEach(val => {
                    if (!val) return;
                    cacheModelName({ id: field.id, value: val });
                });
                field._tempModels = [];
                field.historyNonce = (field.historyNonce || 0) + 1;
            }
        });
    });
}

// Show toast notification - now uses new notification system
function showToast(message, type = 'info') {
    // Use new frontend notification system based on type
    if (window.Alpine && window.Alpine.store && window.Alpine.store('notificationStore')) {
        const store = window.Alpine.store('notificationStore');
        switch (type.toLowerCase()) {
            case 'error':
                return store.frontendError(message, "Settings", 5);
            case 'success':
                return store.frontendInfo(message, "Settings", 3);
            case 'warning':
                return store.frontendWarning(message, "Settings", 4);
            case 'info':
            default:
                return store.frontendInfo(message, "Settings", 3);
        }
    } else {
        // Fallback if Alpine/store not ready
        console.log(`SETTINGS ${type.toUpperCase()}: ${message}`);
        return null;
    }
}
