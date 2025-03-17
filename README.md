# Web Viewer URL Checker for Obsidian

A productivity-focused plugin for Obsidian that helps you avoid distracting websites when using the Web Viewer plugin.

## Features

- 🚫 **URL Blocking**: Automatically closes web viewer tabs containing blocked domains or keywords
- 📋 **Customizable Blocklist**: Add, remove, or modify websites and keywords to block
- 🔍 **URL & Search Query Analysis**: Detects blocked content in both URLs and search queries
- ⏰ **Nuclear Mode**: Schedule enforced blocking periods when you need to focus
- 🔒 **Commitment Device**: During nuclear mode, you can't disable blocking or remove items from the blocklist

## Installation

### From Obsidian Community Plugins

1. Open Obsidian
2. Go to Settings > Community plugins
3. Disable Safe mode if it's enabled
4. Click "Browse" and search for "Web Viewer URL Checker"
5. Click Install, then Enable

### Manual Installation

1. Download the latest release from the [github repository](https://github.com/hariharprasadd/obsidian-web-blocker)
2. Extract the contents to your Obsidian plugins folder: `{vault}/.obsidian/plugins/obsidian-web-blocker/`
3. Restart Obsidian
4. Go to Settings > Community plugins and enable "Web Blocker"

## Usage

### Basic Configuration

1. Go to Settings > Web Blocker
2. Enable URL Blocking
3. Edit the blocklist to include websites or keywords you want to block

### Adding to the Blocklist

You can add entries to the blocklist in several ways:
- One entry per line
- Multiple entries on a single line separated by commas
- Multiple entries on a single line separated by tabs or semicolons

Example blocklist:
```
youtube
twitter, instagram
facebook
reddit
news
```

### Nuclear Mode

Nuclear Mode is a strict focus mode that enforces blocking during specified hours:

1. In plugin settings, enable Nuclear Mode
2. Set your preferred start and end times (24-hour format)
3. Click "Activate Schedule"

During Nuclear Mode:
- URL blocking cannot be disabled
- Items cannot be removed from the blocklist
- You can still add new items to the blocklist

## How it Works

This plugin monitors the Web Viewer plugin's address bar for blocked domains and keywords. When a match is found, it automatically closes the Web Viewer tab.

The plugin checks:
- The domain and path of the URL
- Search query parameters in the URL
- Other URL parameters that might contain blocked terms

## Configuration

The plugin creates a blocklist file at `{vault}/.obsidian/plugins/obsidian-webviewer-url-checker/data/blocklist.txt`.

### Default Settings

```json
{
  "isEnabled": true,
  "blocklistContent": "youtube\ntwitter\nfacebook\nreddit",
  "nuclearModeEnabled": false,
  "nuclearStartTime": "22:00",
  "nuclearEndTime": "05:00",
  "nuclearActive": false
}
```

## Compatibility

This plugin is compatible with Obsidian v0.15.0 and newer, and requires the Web Viewer plugin to be installed.

## Development

This plugin uses TypeScript and the Obsidian API.

### Building

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`

### Testing

1. Build the plugin
2. Copy the `main.js` and `manifest.json` files to your vault's plugin folder
3. Reload Obsidian

## Support

If you encounter any issues or have suggestions, please [create an issue](https://github.com/hariharprasadd/obsidian-web-blocker/issues).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Inspired by productivity apps like Freedom and Cold Turkey