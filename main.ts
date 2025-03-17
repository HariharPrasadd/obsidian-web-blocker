import { App, PluginSettingTab, Setting, Plugin, Notice, Modal } from 'obsidian';

// Define the plugin settings interface
interface WebViewerUrlCheckerSettings {
    isEnabled: boolean;
    blocklistContent: string;
    nuclearModeEnabled: boolean;
    nuclearStartTime: string; // 24-hour format: "HH:MM"
    nuclearEndTime: string;   // 24-hour format: "HH:MM"
    nuclearActive: boolean;   // Flag to track if nuclear mode is currently active
}

// Default settings
const DEFAULT_SETTINGS: WebViewerUrlCheckerSettings = {
    isEnabled: true,
    blocklistContent: "youtube\ntwitter\nfacebook\nreddit",
    nuclearModeEnabled: false,
    nuclearStartTime: "22:00",
    nuclearEndTime: "05:00",
    nuclearActive: false
}

export default class WebViewerUrlChecker extends Plugin {
    settings: WebViewerUrlCheckerSettings;
    private intervalId: number = 0;
    private nuclearTimerId: number = 0;
    private addressValues: Map<string, string> = new Map();
    private stringsToCheck: string[] = [];
    private blocklistFilePath = 'blocklist.txt';
    private originalBlocklist: string = "";

    async onload() {
        // Load settings
        await this.loadSettings();
        
        // Create data folder if it doesn't exist
        await this.ensureDataFolder();
        
        // Load blocklist
        await this.loadBlocklist();
        
        // Add settings tab
        this.addSettingTab(new WebViewerUrlCheckerSettingTab(this.app, this));
        
        // Start monitoring if enabled
        if (this.settings.isEnabled) {
            this.startMonitoring();
        }
        
        // Check if nuclear mode should be active
        if (this.settings.nuclearModeEnabled) {
            this.settings.nuclearActive = this.checkNuclearStatus();
            if (this.settings.nuclearActive) {
                this.enforceNuclearMode();
            }
            this.startNuclearTimer();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async ensureDataFolder() {
        // Make sure the data folder exists
        const dataFolderExists = await this.app.vault.adapter.exists(this.manifest.dir + '/data');
        if (!dataFolderExists) {
            await this.app.vault.adapter.mkdir(this.manifest.dir + '/data');
        }
    }

    async loadBlocklist() {
        const blocklistPath = this.manifest.dir + '/data/' + this.blocklistFilePath;
        
        try {
            // Check if blocklist file exists
            const blocklistExists = await this.app.vault.adapter.exists(blocklistPath);
            
            if (!blocklistExists) {
                // Create default blocklist file using settings content
                await this.app.vault.adapter.write(blocklistPath, this.settings.blocklistContent);
            } else {
                // Read the blocklist file to update settings
                const data = await this.app.vault.adapter.read(blocklistPath);
                if (data) {
                    this.settings.blocklistContent = data;
                    await this.saveSettings();
                }
            }
            
            // Parse the content of the file
            this.stringsToCheck = this.parseBlocklist(this.settings.blocklistContent);
        } catch (error) {
            // If there's an error, use default values
            this.stringsToCheck = this.parseBlocklist(DEFAULT_SETTINGS.blocklistContent);
        }
    }
    
    // Update blocklist file from settings
    async saveBlocklist() {
        // If nuclear mode is active, ensure we're not removing any entries
        if (this.settings.nuclearActive) {
            // Get the original blocklist entries (from when nuclear mode started)
            const originalEntries = this.parseBlocklist(this.originalBlocklist);
            
            // Get the current entered blocklist content
            const currentEntries = this.parseBlocklist(this.settings.blocklistContent);
            
            // Check if all original entries are still present
            const missingEntries = originalEntries.filter(entry => 
                !currentEntries.includes(entry));
                
            if (missingEntries.length > 0) {
                // Some original entries were removed, which isn't allowed
                new Notice('Removing entries is not allowed during nuclear mode. Your additions have been preserved.');
                
                // Create a new blocklist with all original entries AND any new entries
                const allEntries = [...new Set([...originalEntries, ...currentEntries])];
                
                // Update the blocklist content
                this.settings.blocklistContent = allEntries.join('\n');
                
                // Update the text area in the UI if it exists
                const textArea = document.querySelector('.blocklist-editor') as HTMLTextAreaElement;
                if (textArea) {
                    textArea.value = this.settings.blocklistContent;
                }
            }
        }
        
        const blocklistPath = this.manifest.dir + '/data/' + this.blocklistFilePath;
        
        try {
            await this.app.vault.adapter.write(blocklistPath, this.settings.blocklistContent);
            this.stringsToCheck = this.parseBlocklist(this.settings.blocklistContent);
            return true;
        } catch (error) {
            console.error("Failed to save blocklist:", error);
            return false;
        }
    }
    
    parseBlocklist(content: string): string[] {
        const keywords: string[] = [];
        
        // Split by newline first
        const lines = content.split(/\r?\n/);
        
        for (const line of lines) {
            // Skip empty lines
            if (!line.trim()) continue;
            
            // Check if the line has common separators (comma, tab, semicolon)
            if (line.includes(',') || line.includes('\t') || line.includes(';')) {
                // Split by common separators
                const parts = line.split(/[,\t;]+/);
                
                for (const part of parts) {
                    const trimmed = part.trim();
                    if (trimmed) keywords.push(trimmed);
                }
            } else {
                // Just add the whole line as a keyword
                keywords.push(line.trim());
            }
        }
        
        // Remove duplicates
        return [...new Set(keywords)];
    }

    startMonitoring() {
        // Clear existing interval if any
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
        }
        
        // Check every 500ms (twice per second)
        this.intervalId = window.setInterval(() => {
            this.checkAllWebViewerAddresses();
        }, 500);
    }

    stopMonitoring() {
        if (this.intervalId) {
            window.clearInterval(this.intervalId);
            this.intervalId = 0;
        }
    }

    checkAllWebViewerAddresses() {
        // Find all webviewer-address elements
        const addressElements = document.querySelectorAll('.webviewer-address');
        
        if (addressElements.length === 0) {
            return;
        }
        
        // Create a set of current element IDs to detect removals
        const currentIds = new Set<string>();
        
        // Iterate through all address bars
        addressElements.forEach((element) => {
            // Get the input element
            const inputElement = element.querySelector('input');
            
            if (inputElement) {
                // Create a unique ID for this element based on its position in DOM
                const elemId = this.getElementPath(element);
                currentIds.add(elemId);
                
                const currentValue = inputElement.value;
                const previousValue = this.addressValues.get(elemId);
                
                // Only check if the value has changed or is new
                if (currentValue && currentValue !== previousValue) {
                    this.addressValues.set(elemId, currentValue);
                    this.checkUrlForStrings(currentValue);
                }
            }
        });
        
        // Clean up tracking for elements that no longer exist
        for (const elemId of this.addressValues.keys()) {
            if (!currentIds.has(elemId)) {
                this.addressValues.delete(elemId);
            }
        }
    }

    checkUrlForStrings(url: string) {
        try {
            // Skip checks if blocking is disabled
            if (!this.settings.isEnabled) return;
            
            // Check if the URL itself contains any of the strings
            for (const stringToCheck of this.stringsToCheck) {
                if (url.toLowerCase().includes(stringToCheck.toLowerCase())) {
                    const leaf = this.app.workspace.getMostRecentLeaf();
                    if (leaf) {
                        const viewType = leaf.view.getViewType();
                        this.app.workspace.detachLeavesOfType(viewType);
                    }
                    return;
                }
            }
            
            // Parse the URL to extract query parameters
            const parsedUrl = new URL(url);
            const searchParams = parsedUrl.searchParams;
            
            // Check common search query parameters
            const queryParams = ['q', 'query', 'search', 'text', 'term', 'p', 'keyword'];
            
            for (const param of queryParams) {
                if (searchParams.has(param)) {
                    const searchQuery = searchParams.get(param) || '';
                    
                    // Decode the search query
                    const decodedQuery = decodeURIComponent(searchQuery)
                        .replace(/\+/g, ' ')  // Replace + with spaces
                        .toLowerCase();
                    
                    // Check each string against the decoded query
                    for (const stringToCheck of this.stringsToCheck) {
                        if (decodedQuery.includes(stringToCheck.toLowerCase())) {
                            const leaf = this.app.workspace.getMostRecentLeaf();
                            if (leaf) {
                                const viewType = leaf.view.getViewType();
                                this.app.workspace.detachLeavesOfType(viewType);
                                return;
                            }
                        }
                    }
                }
            }
            
            // Also check all other parameters
            searchParams.forEach((value, key) => {
                const decodedValue = decodeURIComponent(value).replace(/\+/g, ' ').toLowerCase();
                
                for (const stringToCheck of this.stringsToCheck) {
                    if (decodedValue.includes(stringToCheck.toLowerCase())) {
                        const leaf = this.app.workspace.getMostRecentLeaf();
                        if (leaf) {
                            const viewType = leaf.view.getViewType();
                            this.app.workspace.detachLeavesOfType(viewType);
                            return;
                        }
                    }
                }
            });
            
        } catch (error) {
            // Silently handle invalid URLs
        }
    }
    
    // Helper function to generate a unique path for an element
    getElementPath(element: Element): string {
        let path = '';
        let current = element;
        
        while (current && current !== document.body) {
            const index = Array.from(current.parentElement?.children || []).indexOf(current);
            path = `${current.tagName}:${index}>${path}`;
            current = current.parentElement as Element;
        }
        
        return path;
    }

    // NUCLEAR MODE FUNCTIONS
    
    // Check if nuclear mode should be active based on current time
    private checkNuclearStatus(): boolean {
        if (!this.settings.nuclearModeEnabled) return false;
        
        // Parse the start and end times
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // Parse the stored times (format: "HH:MM")
        const [startHour, startMinute] = this.settings.nuclearStartTime.split(':').map(Number);
        const [endHour, endMinute] = this.settings.nuclearEndTime.split(':').map(Number);
        
        // Calculate current time in minutes for easier comparison
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;
        
        // Handle cases where the time spans across midnight
        if (startTimeInMinutes < endTimeInMinutes) {
            // Normal case: Start time is before end time in the same day
            return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes;
        } else {
            // Across midnight case: End time is on the next day
            return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes;
        }
    }
    
    // Start timer to check nuclear status
    private startNuclearTimer() {
        // Clear existing timer if any
        if (this.nuclearTimerId) {
            window.clearInterval(this.nuclearTimerId);
        }
        
        // Check every minute
        this.nuclearTimerId = window.setInterval(() => {
            const wasActive = this.settings.nuclearActive;
            this.settings.nuclearActive = this.checkNuclearStatus();
            
            // If status changed
            if (wasActive !== this.settings.nuclearActive) {
                if (this.settings.nuclearActive) {
                    // Nuclear mode just activated
                    this.enforceNuclearMode();
                } else {
                    // Nuclear mode just deactivated
                    this.releaseNuclearMode();
                }
                this.saveSettings();
            }
        }, 60000); // Check every minute
    }
    
    // Enforce nuclear mode restrictions
    private enforceNuclearMode() {
        // Store the original blocklist for later comparison
        this.originalBlocklist = this.settings.blocklistContent;
        
        // Force enable blocking if it was disabled
        if (!this.settings.isEnabled) {
            this.settings.isEnabled = true;
            this.startMonitoring();
        }
        
        // Show notification
        const endTime = this.formatTimeForDisplay(this.settings.nuclearEndTime);
        new Notice(`Nuclear mode activated! Blocking is enforced until ${endTime}`);

        // Update UI if settings tab is open
        this.updateSettingsUI();
    }
    
    // Release nuclear mode restrictions
    private releaseNuclearMode() {
        // Show notification
        new Notice('Nuclear mode deactivated. Normal settings restored.');
        
        // Update UI if settings tab is open
        this.updateSettingsUI();
    }
    
    // Update settings UI based on nuclear mode status
    private updateSettingsUI() {
        // Find and update UI elements if settings tab is open
        const blockingToggle = document.querySelector('.setting-item [data-nuclear-blocktoggle]') as HTMLElement;
        if (blockingToggle) {
            if (this.settings.nuclearActive) {
                blockingToggle.style.opacity = '0.5';
                blockingToggle.style.pointerEvents = 'none';
            } else {
                blockingToggle.style.opacity = '';
                blockingToggle.style.pointerEvents = '';
            }
        }
    }
    
    // Helper to validate time format (HH:MM)
    public isValidTimeFormat(time: string): boolean {
        // Check if the format is HH:MM
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
        return timeRegex.test(time);
    }
    
    // Helper to format time for display (with AM/PM)
    public formatTimeForDisplay(time24: string): string {
        const [hours, minutes] = time24.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
        return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
    
    // Activate nuclear mode schedule
    public activateNuclearSchedule() {
        // Validate times
        if (!this.isValidTimeFormat(this.settings.nuclearStartTime) || 
            !this.isValidTimeFormat(this.settings.nuclearEndTime)) {
            new Notice('Please enter valid start and end times in HH:MM format');
            return;
        }
        
        // Enable nuclear mode
        this.settings.nuclearModeEnabled = true;
        
        // Start the timer
        this.startNuclearTimer();
        
        // Save settings
        this.saveSettings();
        
        // Check if we should immediately enter nuclear mode
        if (this.checkNuclearStatus()) {
            this.settings.nuclearActive = true;
            this.enforceNuclearMode();
        }
    }

    onunload() {
        // Clear the intervals when the plugin is disabled
        this.stopMonitoring();
        
        // Clear the nuclear timer
        if (this.nuclearTimerId) {
            window.clearInterval(this.nuclearTimerId);
        }
    }
}

// Settings Tab
class WebViewerUrlCheckerSettingTab extends PluginSettingTab {
    plugin: WebViewerUrlChecker;

    constructor(app: App, plugin: WebViewerUrlChecker) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Web Viewer URL Checker Settings'});

        // Create a container for the toggle with a data attribute for nuclear mode
        const toggleContainer = new Setting(containerEl)
            .setName('Enable URL Blocking')
            .setDesc('When enabled, tabs with blocked content will automatically close.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.isEnabled)
                .onChange(async (value) => {
                    // Only allow disabling if nuclear mode is not active
                    if (!value && this.plugin.settings.nuclearActive) {
                        new Notice('Cannot disable blocking during nuclear mode');
                        toggle.setValue(true);
                        return;
                    }
                    
                    this.plugin.settings.isEnabled = value;
                    await this.plugin.saveSettings();
                    
                    // Start or stop monitoring based on the setting
                    if (value) {
                        this.plugin.startMonitoring();
                    } else {
                        this.plugin.stopMonitoring();
                    }
                }));
        
        // Add a data attribute for easier reference
        toggleContainer.settingEl.setAttribute('data-nuclear-blocktoggle', 'true');
        
        // Disable the toggle if nuclear mode is active
        if (this.plugin.settings.nuclearActive) {
            toggleContainer.settingEl.style.opacity = '0.5';
            toggleContainer.settingEl.style.pointerEvents = 'none';
        }

        containerEl.createEl('h3', {text: 'Blocklist'});
        
        const description = containerEl.createEl('p', {
            text: 'Add websites or keywords to block. One per line, or separate with commas, tabs, or semicolons.',
            cls: 'setting-item-description'
        });

        // Create a container for the text area
        const textAreaContainer = containerEl.createDiv({
            cls: 'setting-item'
        });

        // Add the text area for editing the blocklist
        const textArea = textAreaContainer.createEl('textarea', {
            cls: 'blocklist-editor'
        });
        
        // Style the textarea - fixed size with scrolling
        textArea.style.width = '100%';
        textArea.style.height = '200px';
        textArea.style.fontFamily = 'monospace';
        textArea.style.marginBottom = '12px';
        textArea.style.resize = 'none';  // Prevent resizing
        textArea.style.overflowY = 'auto';  // Enable vertical scrolling
        textArea.value = this.plugin.settings.blocklistContent;

        // Add save button
        const buttonContainer = containerEl.createDiv({
            cls: 'setting-item'
        });
        
        const saveButton = buttonContainer.createEl('button', {
            text: 'Save Blocklist',
            cls: 'mod-cta'
        });
        
        // Add save button event listener
        saveButton.addEventListener('click', async () => {
            this.plugin.settings.blocklistContent = textArea.value;
            await this.plugin.saveSettings();
            const success = await this.plugin.saveBlocklist();
            
            // Show a notification
            if (success) {
                new Notice('Blocklist saved successfully');
            } else {
                new Notice('Failed to save blocklist', 4000);
            }
        });

        // Add event listener for real-time updates
        textArea.addEventListener('input', async () => {
            this.plugin.settings.blocklistContent = textArea.value;
            await this.plugin.saveSettings();
            await this.plugin.saveBlocklist();
            // No notification for auto-save to avoid spamming the user
        });

        // Add nuclear mode settings
        containerEl.createEl('h3', {text: 'Nuclear Mode Settings'});

        new Setting(containerEl)
            .setName('Enable Nuclear Mode')
            .setDesc('Set daily time periods when blocking is enforced and blocklist cannot be modified.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.nuclearModeEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.nuclearModeEnabled = value;
                    await this.plugin.saveSettings();
                    
                    // Refresh the UI to show/hide time pickers
                    this.display();
                }));

        if (this.plugin.settings.nuclearModeEnabled) {
            // Add time pickers for daily schedule
            new Setting(containerEl)
                .setName('Nuclear Mode Start Time')
                .setDesc('Daily time when nuclear mode begins')
                .addText(text => {
                    text
                        .setPlaceholder('HH:MM (e.g., 22:00)')
                        .setValue(this.plugin.settings.nuclearStartTime || '')
                        .onChange(async (value) => {
                            // Validate time format
                            if (this.plugin.isValidTimeFormat(value)) {
                                this.plugin.settings.nuclearStartTime = value;
                                text.inputEl.style.borderColor = '';
                                await this.plugin.saveSettings();
                            } else if (value.trim() !== '') {
                                text.inputEl.style.borderColor = 'red';
                            }
                        });
                        
                    // Add a tooltip
                    text.inputEl.setAttribute('title', 'Enter time in 24-hour format: HH:MM');
                    text.inputEl.style.width = '100px';
                    
                    return text;
                });
                
            // Add helper text
            const startTimeHelperEl = containerEl.createEl('div', {
                text: '24-hour format (00:00 - 23:59)',
                cls: 'setting-item-description'
            });
            startTimeHelperEl.style.marginLeft = '24px';
            startTimeHelperEl.style.marginTop = '-12px';
            startTimeHelperEl.style.marginBottom = '12px';
            startTimeHelperEl.style.color = 'var(--text-muted)';
                
            new Setting(containerEl)
                .setName('Nuclear Mode End Time')
                .setDesc('Daily time when nuclear mode ends')
                .addText(text => {
                    text
                        .setPlaceholder('HH:MM (e.g., 05:00)')
                        .setValue(this.plugin.settings.nuclearEndTime || '')
                        .onChange(async (value) => {
                            // Validate time format
                            if (this.plugin.isValidTimeFormat(value)) {
                                this.plugin.settings.nuclearEndTime = value;
                                text.inputEl.style.borderColor = '';
                                await this.plugin.saveSettings();
                            } else if (value.trim() !== '') {
                                text.inputEl.style.borderColor = 'red';
                            }
                        });
                        
                    // Add a tooltip
                    text.inputEl.setAttribute('title', 'Enter time in 24-hour format: HH:MM');
                    text.inputEl.style.width = '100px';
                    
                    return text;
                });

            // Add helper text
            const endTimeHelperEl = containerEl.createEl('div', {
                text: '24-hour format (00:00 - 23:59). Can be earlier than start time to block overnight.',
                cls: 'setting-item-description'
            });
            endTimeHelperEl.style.marginLeft = '24px';
            endTimeHelperEl.style.marginTop = '-12px';
            endTimeHelperEl.style.marginBottom = '12px';
            endTimeHelperEl.style.color = 'var(--text-muted)';
            
            // Add activate button
            new Setting(containerEl)
                .setName('Activate Nuclear Schedule')
                .setDesc('Activate the daily nuclear mode schedule')
                .addButton(button => button
                    .setButtonText('Activate Schedule')
                    .setCta()
                    .onClick(() => {
                        // Show confirmation dialog
                        this.showNuclearConfirmation();
                    }));
        }
    }
    
    // Show confirmation dialog before activating nuclear mode
    private showNuclearConfirmation() {
        if (!this.plugin.isValidTimeFormat(this.plugin.settings.nuclearStartTime) || 
            !this.plugin.isValidTimeFormat(this.plugin.settings.nuclearEndTime)) {
            new Notice('Please enter valid start and end times in HH:MM format');
            return;
        }
        
        // Format times for display
        const startTime = this.plugin.formatTimeForDisplay(this.plugin.settings.nuclearStartTime);
        const endTime = this.plugin.formatTimeForDisplay(this.plugin.settings.nuclearEndTime);
        
        // Create modal
        const modal = new Modal(this.app);
        modal.titleEl.setText('Confirm Nuclear Mode Schedule');
        
        const content = modal.contentEl.createDiv();
        
        // Determine if schedule spans across midnight
        const [startHour, startMinute] = this.plugin.settings.nuclearStartTime.split(':').map(Number);
        const [endHour, endMinute] = this.plugin.settings.nuclearEndTime.split(':').map(Number);
        const startTimeInMinutes = startHour * 60 + startMinute;
        const endTimeInMinutes = endHour * 60 + endMinute;
        
        let scheduleText = '';
        if (startTimeInMinutes < endTimeInMinutes) {
            scheduleText = `Web blocking will be active daily from ${startTime} to ${endTime}`;
        } else {
            scheduleText = `Web blocking will be active daily from ${startTime} until ${endTime} the next morning`;
        }
        
        content.createEl('p', {
            text: `${scheduleText}. During these hours, you won't be able to disable blocking or remove items from the blocklist. Are you sure you want to proceed?`
        });
        
        // Add buttons
        const buttonContainer = content.createDiv({ cls: 'modal-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => {
            modal.close();
        });
        
        const confirmButton = buttonContainer.createEl('button', { 
            text: 'Confirm Schedule',
            cls: 'mod-cta'
        });
        confirmButton.addEventListener('click', async () => {
            // Activate nuclear mode scheduling
            this.plugin.activateNuclearSchedule();
            modal.close();
            new Notice('Nuclear schedule activated');
        });
        
        modal.open();
    }
}