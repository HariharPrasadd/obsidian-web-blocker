import { Plugin } from 'obsidian';

export default class WebViewerUrlChecker extends Plugin {
	private intervalId: number = 0;
	private addressValues: Map<string, string> = new Map();
	private stringToCheck: string = "youtube"; // String to check for in URLs

	async onload() {
		// Start continuous monitoring
		this.startMonitoring();
	}

	startMonitoring() {
		// Check every 500ms (twice per second)
		this.intervalId = window.setInterval(() => {
			this.checkAllWebViewerAddresses();
		}, 500);
	}

	checkAllWebViewerAddresses() {
		// Find all webviewer-address elements
		const addressElements = document.querySelectorAll('.webviewer-address');
		
		if (addressElements.length === 0) {
			// Don't log anything if not found
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
					
					// Check if the URL contains the specified string
					if (currentValue.toLowerCase().includes(this.stringToCheck.toLowerCase())) {
						console.log(`URL contains "${this.stringToCheck}": ${currentValue}`);
					}
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
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
		}
	}
}