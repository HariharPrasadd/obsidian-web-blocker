import { Plugin } from 'obsidian';

export default class WebViewerUrlChecker extends Plugin {
	private intervalId: number = 0;
	private addressValues: Map<string, string> = new Map();
	private stringsToCheck: string[] = ["youtube", "twitter", "facebook", "reddit"]; // Array of strings to check for

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
			// Check if the URL itself contains any of the strings
			for (const stringToCheck of this.stringsToCheck) {
				if (url.toLowerCase().includes(stringToCheck.toLowerCase())) {
					console.log(`URL contains "${stringToCheck}": ${url}`);
					// We don't return here as the URL might contain multiple strings of interest
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
							console.log(`Search query contains "${stringToCheck}": ${decodedQuery}`);
						}
					}
				}
			}
			
			// Also check all other parameters
			searchParams.forEach((value, key) => {
				const decodedValue = decodeURIComponent(value).replace(/\+/g, ' ').toLowerCase();
				
				for (const stringToCheck of this.stringsToCheck) {
					if (decodedValue.includes(stringToCheck.toLowerCase())) {
						console.log(`URL parameter "${key}" contains "${stringToCheck}": ${decodedValue}`);
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
		if (this.intervalId) {
			window.clearInterval(this.intervalId);
		}
	}
}