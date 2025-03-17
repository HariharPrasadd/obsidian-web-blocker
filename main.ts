import { App, PluginSettingTab, Setting, Plugin, Notice } from 'obsidian';

// Define the plugin settings interface
interface WebViewerUrlCheckerSettings {
    isEnabled: boolean;
    blocklistContent: string;
}

// Default settings
const DEFAULT_SETTINGS: WebViewerUrlCheckerSettings = {
    isEnabled: true,
    blocklistContent: "youtube\ntwitter\nfacebook\nreddit"
}

export default class WebViewerUrlChecker extends Plugin {
    settings: WebViewerUrlCheckerSettings;
    private intervalId: number = 0;
    private addressValues: Map<string, string> = new Map();
    private stringsToCheck: string[] = [];
    private blocklistFilePath = 'blocklist.txt';

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

    onunload() {
        // Clear the interval when the plugin is disabled
        this.stopMonitoring();
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

        new Setting(containerEl)
            .setName('Enable URL Blocking')
            .setDesc('When enabled, tabs with blocked content will automatically close.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.isEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.isEnabled = value;
                    await this.plugin.saveSettings();
                    
                    // Start or stop monitoring based on the setting
                    if (value) {
                        this.plugin.startMonitoring();
                    } else {
                        this.plugin.stopMonitoring();
                    }
                }));

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
        
        // Style the textarea
        textArea.style.width = '100%';
        textArea.style.height = '200px';
        textArea.style.fontFamily = 'monospace';
        textArea.style.marginBottom = '12px';
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
    }
}