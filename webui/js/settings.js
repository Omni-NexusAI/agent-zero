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
                "sections": set.settings.sections,
                "models_history": set.settings.models_history || {},
                "models_context_history": set.settings.models_context_history || {}
            }

            // Initialize model picker dropdown flags before wiring to modal
            this.initializeModelFieldDropdowns(settings.sections);

            // Update modal data
            modalAD.isOpen = true;
            modalAD.settings = settings;

            // Migrate old localStorage history to server settings
            this.migrateModelHistory();

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
                // Persist any staged model names before saving
                try {
                    this.cacheAllModelNames(modalAD.settings.sections);
                } catch (cacheErr) {
                    console.warn('cacheAllModelNames failed:', cacheErr);
                }
                // Send the entire settings object, which now includes models_history
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
    },

    // --- Model Picker Methods ---

    // Helper to find the provider field associated with a model name field
    getProviderField(field, section) {
        if (!field.id) return null;
        let providerId = field.id.replace('_name', '_provider');

        if (section && section.fields) {
            return section.fields.find(f => f.id === providerId);
        }
        return null;
    },

    // Migrate old localStorage history to server-side settings
    migrateModelHistory() {
        if (!this.settings || !this.settings.sections) return;

        let migratedCount = 0;

        this.settings.sections.forEach(section => {
            if (!section.fields) return;
            section.fields.forEach(field => {
                if (field.type === 'text' && (
                    field.id && (field.id.endsWith('_model_name') ||
                    field.id === 'chat_model_name' ||
                    field.id === 'util_model_name' ||
                    field.id === 'browser_model_name' ||
                    field.id === 'embed_model_name'))
                ) {
                    const key = `model_history_${field.id}`;
                    const cached = localStorage.getItem(key);
                    if (cached) {
                        try {
                            const history = JSON.parse(cached);
                            if (Array.isArray(history) && history.length > 0) {
                                // Find provider
                                const providerField = this.getProviderField(field, section);
                                const provider = providerField ? providerField.value : 'unknown';

                                // Initialize structure
                                if (!this.settings.models_history) this.settings.models_history = {};
                                if (!this.settings.models_history[field.id]) this.settings.models_history[field.id] = {};
                                if (!this.settings.models_history[field.id][provider]) this.settings.models_history[field.id][provider] = [];

                                // Merge unique
                                const currentList = this.settings.models_history[field.id][provider];
                                history.forEach(name => {
                                    if (!currentList.includes(name)) {
                                        currentList.unshift(name); // Add to beginning
                                    }
                                });

                                // Limit to 20
                                this.settings.models_history[field.id][provider] = this.settings.models_history[field.id][provider].slice(0, 20);

                                migratedCount++;
                            }
                            localStorage.removeItem(key);
                        } catch (e) {
                            console.error("Error migrating history for " + field.id, e);
                        }
                    }
                }
            });
        });

        if (migratedCount > 0) {
            console.log(`Migrated model history for ${migratedCount} fields.`);
        }
    },

    getCachedModelNames(field, section) {
        // Read reactive nonce
        // eslint-disable-next-line no-unused-vars
        const _nonce = field?.historyNonce;

        // Get temp models (staged in this session)
        const temp = field?._tempModels || [];

        // Get history from settings based on provider
        let history = [];
        if (this.settings && this.settings.models_history && field.id) {
            const providerField = this.getProviderField(field, section);
            const provider = providerField ? providerField.value : 'unknown';

            if (this.settings.models_history[field.id] && this.settings.models_history[field.id][provider]) {
                history = this.settings.models_history[field.id][provider];
            }
        }

        return [...new Set([...temp, ...history])];
    },

    cacheModelName(field, section, value) {
        const val = value || field.value?.trim();
        if (!val) return;

        if (!this.settings.models_history) this.settings.models_history = {};
        if (!this.settings.models_history[field.id]) this.settings.models_history[field.id] = {};

        const providerField = this.getProviderField(field, section);
        const provider = providerField ? providerField.value : 'unknown';

        if (!this.settings.models_history[field.id][provider]) this.settings.models_history[field.id][provider] = [];

        const currentList = this.settings.models_history[field.id][provider];

        // Remove if exists
        const filtered = currentList.filter(name => name !== val);

        // Add to beginning
        filtered.unshift(val);

        // Limit
        this.settings.models_history[field.id][provider] = filtered.slice(0, 20);

        // Also cache context length if applicable
        if (field.id === 'chat_model_name') {
            const ctxLengthField = section.fields.find(f => f.id === 'chat_model_ctx_length');
            if (ctxLengthField) {
                if (!this.settings.models_context_history) this.settings.models_context_history = {};
                if (!this.settings.models_context_history[field.id]) this.settings.models_context_history[field.id] = {};
                if (!this.settings.models_context_history[field.id][provider]) this.settings.models_context_history[field.id][provider] = {};

                this.settings.models_context_history[field.id][provider][val] = parseInt(ctxLengthField.value, 10) || 128000;
            }
        }
    },

    saveModelName(field, section) {
        const value = field.value?.trim();
        if (!value) return;

        if (!field._tempModels) field._tempModels = [];
        if (!field._tempModels.includes(value)) {
            field._tempModels.unshift(value);
        }

        // Also persist to settings immediately if desired, or wait for Save button.
        // User requested "saved save per provider".
        // If I update `models_history` here, it will be saved when user clicks Save.
        // But the dropdown should update immediately.
        // The dropdown calls `getCachedModelNames` which reads from `models_history`.
        // So I should update `models_history` here too?
        // Actually, if I update `models_history` here, it is "staged" for save.

        // Let's call cacheModelName to update the history structure in memory
        this.cacheModelName(field, section, value);

        field.historyNonce = (field.historyNonce || 0) + 1;
        field.value = '';
        if (field.showDropdown) field.showDropdown = false;
    },

    removeModelName(field, section, modelName) {
        const targetValue = modelName;
        if (!targetValue) return;

        // Remove from temp
        if (field._tempModels) {
            field._tempModels = field._tempModels.filter(name => name !== targetValue);
        }

        // Remove from settings history
        if (this.settings && this.settings.models_history && field.id) {
            const providerField = this.getProviderField(field, section);
            const provider = providerField ? providerField.value : 'unknown';

            if (this.settings.models_history[field.id] && this.settings.models_history[field.id][provider]) {
                const list = this.settings.models_history[field.id][provider];
                this.settings.models_history[field.id][provider] = list.filter(name => name !== targetValue);
            }
        }

        field.historyNonce = (field.historyNonce || 0) + 1;

        // Clear field if matches
        if (field.value === targetValue) {
            field.value = '';
            // Propagate event if needed? Alpine model should handle it if bound.
        }
    },

    toggleModelDropdown(field) {
        // Close all other dropdowns
        if (this.settings && this.settings.sections) {
            this.settings.sections.forEach(section => {
                if (section.fields) {
                    section.fields.forEach(f => {
                         if (f !== field && typeof f.showDropdown !== 'undefined') {
                             f.showDropdown = false;
                         }
                    });
                }
            });
        }

        field.showDropdown = !field.showDropdown;
    },

    selectModelName(field, modelName) {
        field.value = modelName;
        field.showDropdown = false;

        // Apply cached context length if applicable
        if (field.id === 'chat_model_name' && this.settings && this.settings.sections) {
            const section = this.settings.sections.find(s => s.fields && s.fields.includes(field));
            if (section) {
                const providerField = this.getProviderField(field, section);
                const provider = providerField ? providerField.value : 'unknown';

                if (this.settings.models_context_history &&
                    this.settings.models_context_history[field.id] &&
                    this.settings.models_context_history[field.id][provider] &&
                    this.settings.models_context_history[field.id][provider][modelName]) {

                    const ctxLength = this.settings.models_context_history[field.id][provider][modelName];
                    const ctxLengthField = section.fields.find(f => f.id === 'chat_model_ctx_length');
                    if (ctxLengthField) {
                        ctxLengthField.value = ctxLength;
                    }
                }
            }
        }
    },

    handleFieldInput(field, value) {
        field.value = value;
    },

    handleSelectChange(field, value) {
        field.value = value;

        // If provider changed for chat model, apply default URLs for local providers
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
        } else if (value === 'ollama' && (!apiBaseField.value || apiBaseField.value.trim() === '')) {
                        apiBaseField.value = 'http://localhost:11434';
                    }
                }
            }
        }
    },

    cacheAllModelNames(sections) {
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
                    // Cache temp models
                    if (field._tempModels && field._tempModels.length > 0) {
                        field._tempModels.forEach(val => {
                            this.cacheModelName(field, section, val);
                        });
                        field._tempModels = [];
                    }
                    // Cache current value if valid
                    if (field.value && field.value.trim()) {
                        this.cacheModelName(field, section, field.value.trim());
                    }

                    field.historyNonce = (field.historyNonce || 0) + 1;
                }
            });
        });
    }
};


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
