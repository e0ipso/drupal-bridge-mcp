# 03: Drupal Content Integration

## Overview
Connect the **MCP Server** to Drupal backends using JSON-RPC protocol, enabling **MCP Clients** to access Drupal content and functionality through **MCP Server** tools. This phase provides the core content management capabilities, with the **MCP Server** handling authenticated Drupal communication using tokens received from **MCP Clients**.

## User-Facing Features
- **Search Tutorials Tool**: **MCP Server** provides search for Drupal tutorials and documentation to **MCP Clients**
- **Get Tutorial Tool**: **MCP Server** retrieves specific tutorial content by ID for **MCP Clients**
- **Authenticated Requests**: **MCP Server** handles all Drupal operations using OAuth tokens received from **MCP Clients**
- **Content Filtering**: **MCP Server** supports various search parameters and filters requested by **MCP Clients**

## Functional Capabilities
- **MCP Server** executes JSON-RPC calls to Drupal backend
- **MCP Server** searches content with keyword queries from **MCP Clients**
- **MCP Server** filters by content type (tutorial, documentation, guide)
- **MCP Server** retrieves full content details including metadata for **MCP Clients**
- **MCP Server** handles pagination for large result sets
- **MCP Server** supports Drupal version-specific content requests

## Content Types Supported
- Tutorials
- Documentation topics
- Courses
- Video content
- Implementation guides

## Technical Stack Requirements

### Core Dependencies
- **json-rpc-2.0**: JSON-RPC client library for Drupal communication

### Drupal Requirements
- Drupal JSON-RPC module installed and configured
- Content endpoints exposed via JSON-RPC
- OAuth integration with Drupal user system

### Environment Configuration
- DRUPAL_URL: Base URL of the Drupal installation
- JSON-RPC endpoint path configuration

## Success Criteria
- **MCP Server** search tool returns relevant Drupal content to **MCP Clients**
- **MCP Server** retrieves individual content items by ID for **MCP Clients**
- **MCP Server** properly includes authentication tokens in Drupal requests
- **MCP Server** handles errors for missing or unauthorized content with proper responses to **MCP Clients**
- **MCP Server** response data is properly formatted for **MCP Client** consumption

## Relevant Resources
- [Drupal JSON-RPC Module](https://www.drupal.org/project/jsonrpc)
- [Drupal Simple OAuth Module](https://www.drupal.org/project/simple_oauth)