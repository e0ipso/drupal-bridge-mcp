## [2.1.2](https://github.com/e0ipso/drupal-bridge-mcp/compare/v2.1.1...v2.1.2) (2025-11-05)


### Bug Fixes

* update remaining --no-auth references in help text and docs ([e26ac75](https://github.com/e0ipso/drupal-bridge-mcp/commit/e26ac75087687b7ec3c6fc6ad8a6c773bdc3540a))

## [2.1.1](https://github.com/e0ipso/drupal-bridge-mcp/compare/v2.1.0...v2.1.1) (2025-11-04)


### Bug Fixes

* better CLI options ([adae787](https://github.com/e0ipso/drupal-bridge-mcp/commit/adae787fbbc4ed60a04105e4f226f25c08834e68))

# [2.1.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v2.0.0...v2.1.0) (2025-11-04)


### Features

* add CLI help and version display utilities ([661f73c](https://github.com/e0ipso/drupal-bridge-mcp/commit/661f73cc483a4d7bdfc27416e89aaee8db0b9baa))
* implement CLI argument parser module ([7ec61af](https://github.com/e0ipso/drupal-bridge-mcp/commit/7ec61af3161dbd86893ce2c72a75663509d8a823))
* implement configuration manager with CLI argument precedence ([b64b98c](https://github.com/e0ipso/drupal-bridge-mcp/commit/b64b98cfe607a2e8df572d8f4d56f9aa75f391a7))
* integrate CLI parser into server entry point ([272b55a](https://github.com/e0ipso/drupal-bridge-mcp/commit/272b55abd6b28a6dc22304ab8cbb889aaceb58f6))

# [2.0.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.11.1...v2.0.0) (2025-11-04)


### Features

* complete per-tool URL migration - config, docs, and tests ([d0041c9](https://github.com/e0ipso/drupal-bridge-mcp/commit/d0041c9a8bcca7e8bfe0ba4e36c4537cb10b927a)), closes [#3](https://github.com/e0ipso/drupal-bridge-mcp/issues/3)
* implement per-tool URL construction for MCP tool invocation ([09ec04f](https://github.com/e0ipso/drupal-bridge-mcp/commit/09ec04f66b05b9e6b76657f9704977c135aac19e)), closes [#3](https://github.com/e0ipso/drupal-bridge-mcp/issues/3)


### BREAKING CHANGES

* This completes the migration from centralized endpoint
* Tools now invoke at /mcp/tools/{tool_name} instead
of centralized /jsonrpc or /mcp/tools/invoke endpoints.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>

## [1.11.1](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.11.0...v1.11.1) (2025-10-29)


### Bug Fixes

* migrate to resource server OAuth pattern and standard JSON-RPC endpoint ([#5](https://github.com/e0ipso/drupal-bridge-mcp/issues/5)) ([879d7a1](https://github.com/e0ipso/drupal-bridge-mcp/commit/879d7a1627b30da5a9bea0c11b41d30eb545b477))

# [1.11.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.10.0...v1.11.0) (2025-10-22)


### Bug Fixes

* ignore settings file ([e768876](https://github.com/e0ipso/drupal-bridge-mcp/commit/e76887642b0fc8138bec850cc0581994815939b4))


### Features

* add software identification to OAuth metadata ([cde9eb6](https://github.com/e0ipso/drupal-bridge-mcp/commit/cde9eb67727d78e79267c59ab14f68b20e8047c8))

# [1.10.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.9.0...v1.10.0) (2025-10-21)


### Features

* update MCP to use HTTP ([43b1e49](https://github.com/e0ipso/drupal-bridge-mcp/commit/43b1e49dca17cafc93fa44fe430e08f69f512d38))

# [1.9.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.8.0...v1.9.0) (2025-10-21)


### Features

* OAuth resource server architecture and scope-aware tool discovery ([#3](https://github.com/e0ipso/drupal-bridge-mcp/issues/3)) ([e26f4bb](https://github.com/e0ipso/drupal-bridge-mcp/commit/e26f4bb17f9b2c39676a98ef02b8ffe9af5e63aa))

# [1.8.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.7.0...v1.8.0) (2025-10-14)


### Features

* more local mounts ([7743d74](https://github.com/e0ipso/drupal-bridge-mcp/commit/7743d746536b7630a0f7365880d8d43eb41c4d9b))

# [1.7.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.6.0...v1.7.0) (2025-10-09)


### Features

* add an auth_login tool that can manage device_code authorization flow end-to-end. ([42ffada](https://github.com/e0ipso/drupal-bridge-mcp/commit/42ffada988066488686fc15c53e6c5cb8ab15ca0))

# [1.6.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.5.0...v1.6.0) (2025-10-08)


### Features

* create dedicated server entry point ([e5b7f33](https://github.com/e0ipso/drupal-bridge-mcp/commit/e5b7f335722aa9466653be8dd17c31554b11b0ea))

# [1.5.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.4.0...v1.5.0) (2025-10-08)


### Bug Fixes

* cleanup whitespace in console start up message ([8df243d](https://github.com/e0ipso/drupal-bridge-mcp/commit/8df243d27351be9c8e45b43e52a602072f7e5561))
* fix allowed headers and add default inspector port (6274) to default CORS origins ([b929e48](https://github.com/e0ipso/drupal-bridge-mcp/commit/b929e488950b0dae3111d1020ba090294e4a566c))
* make Tutorial object schema match what is coming form Drupal ([9f4d7a0](https://github.com/e0ipso/drupal-bridge-mcp/commit/9f4d7a0e36edcb5e151e2eb0092178ea9af7c459))
* remove body parsing check to preserve streaming ([5ff3848](https://github.com/e0ipso/drupal-bridge-mcp/commit/5ff3848164b4fb33a38bf99f0daea3a3f8774a1b))
* update mapping ([f2e7cde](https://github.com/e0ipso/drupal-bridge-mcp/commit/f2e7cde28e174ab9f58eb1ed7d0302c74e2375fb))


### Features

* add debugging endpoints and transport verification ([547d156](https://github.com/e0ipso/drupal-bridge-mcp/commit/547d15646818dc8c57a194c7d4c94921fd3a1a78))
* add transport tracking to health and debug endpoints ([132a6fe](https://github.com/e0ipso/drupal-bridge-mcp/commit/132a6fe465313bf4be56dbe2b433af6b3e1ba9d6))
* add/archive multiple plans ([781ad12](https://github.com/e0ipso/drupal-bridge-mcp/commit/781ad12c26d0326fbcd2f4e4a8d57d6162730dd3))
* **debug:** add comprehensive OAuth token extraction logging ([b02f114](https://github.com/e0ipso/drupal-bridge-mcp/commit/b02f1145e2dbb68d3a36118af9c6f36ae7c3e73b))
* finally add AGENTS.md ([fe47e8b](https://github.com/e0ipso/drupal-bridge-mcp/commit/fe47e8b74c1eed03530fa7b9adab7fab6923a150))
* implement JWT decoder utility for user ID extraction ([484ed42](https://github.com/e0ipso/drupal-bridge-mcp/commit/484ed42cab24e1921ad7dc3348c21eaabbbd29a2))
* implement session lifecycle cleanup and graceful shutdown ([ab13d08](https://github.com/e0ipso/drupal-bridge-mcp/commit/ab13d08296e5a9d1e352cc2c5cb36c1882ab3067))
* implement user-level token storage in device flow ([35fba4d](https://github.com/e0ipso/drupal-bridge-mcp/commit/35fba4dcebe1eb8cd053f75f568579e09553d121))
* **logging:** add unit tests and integrate pino-http middleware ([5350395](https://github.com/e0ipso/drupal-bridge-mcp/commit/5350395305d07be1aa0b8c98052bc4e53e3b610a))
* **logging:** create logger configuration module ([3ac0d8b](https://github.com/e0ipso/drupal-bridge-mcp/commit/3ac0d8ba374085720826239a944d83ad031075b7))
* **logging:** install pino logging dependencies ([8a3fd6f](https://github.com/e0ipso/drupal-bridge-mcp/commit/8a3fd6fb02a8c8591f80c53c3f1993fe029aa788))
* **oauth:** implement token extraction helper method ([850eeb1](https://github.com/e0ipso/drupal-bridge-mcp/commit/850eeb10f0f93a97fba4d249ffa5f52ebdf84b77))
* **oauth:** integrate token extraction in endpoint handler ([b753c5e](https://github.com/e0ipso/drupal-bridge-mcp/commit/b753c5e724276ab1356f872a06d92a06e5269309))
* refactor to per-session Server+Transport architecture (Phase 1) ([554dbbf](https://github.com/e0ipso/drupal-bridge-mcp/commit/554dbbf5725eb7310387898fbb825c22e2a8b417))
* remove broken e2e test ([16b16a7](https://github.com/e0ipso/drupal-bridge-mcp/commit/16b16a76f9f342b4b80d58bce8a1fa659dfb24c9))
* **test:** add MCP Inspector CLI for OAuth e2e testing ([a2fd080](https://github.com/e0ipso/drupal-bridge-mcp/commit/a2fd0804a5ecc7e7ca813e3568746e6ee57f3e27))
* **test:** implement OAuth e2e test suite with Inspector CLI ([1013c1a](https://github.com/e0ipso/drupal-bridge-mcp/commit/1013c1a19f4cdc0f9e3c49054f69e4546036c5a8))

# [1.4.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.3.0...v1.4.0) (2025-10-02)


### Features

* implement dynamic tool handlers and caching ([d9590aa](https://github.com/e0ipso/drupal-bridge-mcp/commit/d9590aa7a7aceceff8fdb71fca900aede3ef53b4))
* implement tool discovery service ([95caac1](https://github.com/e0ipso/drupal-bridge-mcp/commit/95caac184b44a9da887101bc2e56e361df13bb6c))
* integrate dynamic tool discovery into server startup ([24de557](https://github.com/e0ipso/drupal-bridge-mcp/commit/24de5576f4c4d80b4f17c03ca529ad0ba96caa17))

# [1.3.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.2.0...v1.3.0) (2025-10-02)


### Bug Fixes

* add type assertions to test file for strict null checks ([6b6ed6a](https://github.com/e0ipso/drupal-bridge-mcp/commit/6b6ed6a2d13c46ff998b51e3ce3601bceb7d373d))


### Features

* implement MCP sampling capability detection and query analyzer ([1650e08](https://github.com/e0ipso/drupal-bridge-mcp/commit/1650e082c4f21c5565670d51a9a0bfa4ee9de02f))
* integrate AI-enhanced search with sampling capability ([ca0e0f7](https://github.com/e0ipso/drupal-bridge-mcp/commit/ca0e0f71e508fa3c6023338c510da0b5257b05df))

# [1.2.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.1.0...v1.2.0) (2025-10-01)


### Bug Fixes

* use async/await for promise handing ([a4bd0fc](https://github.com/e0ipso/drupal-bridge-mcp/commit/a4bd0fc34f302eefe7f2e536c7fd97b00166d912))


### Features

* implement content search and retrieval tools ([20bc745](https://github.com/e0ipso/drupal-bridge-mcp/commit/20bc74557aeb4b44d3ad7d4334bcc1c5f4ed1a85))
* implement Drupal JSON-RPC connector and authentication tools ([fe46f60](https://github.com/e0ipso/drupal-bridge-mcp/commit/fe46f60d40d2b6930ffd9a4bfd15e9c70cfa7abb))
* integrate all tools with MCP server ([748a414](https://github.com/e0ipso/drupal-bridge-mcp/commit/748a414f23f210ac844ce1e222d7c7bd7701aefa))

# [1.1.0](https://github.com/e0ipso/drupal-bridge-mcp/compare/v1.0.0...v1.1.0) (2025-10-01)


### Bug Fixes

* gracefully handle OAuth initialization failures ([90e232f](https://github.com/e0ipso/drupal-bridge-mcp/commit/90e232fc08c7f2d8d8224ee7188627fd22dc3ae3))


### Features

* consolidate to HTTP server as default entry point ([6b63c9a](https://github.com/e0ipso/drupal-bridge-mcp/commit/6b63c9a12b6683583db1a928bef53e86bc061951))

# 1.0.0 (2025-09-30)


### Bug Fixes

* address compilation issues ([7ad4822](https://github.com/e0ipso/drupal-bridge-mcp/commit/7ad4822cd466e8a462c95a4ac8d7d201d456374b))
* address linting issues ([ca8569b](https://github.com/e0ipso/drupal-bridge-mcp/commit/ca8569b35fc5114690b713f930a40ea8d9f964f4))
* complete ESLint setup with TypeScript support ([97192ee](https://github.com/e0ipso/drupal-bridge-mcp/commit/97192ee0eb05140780e370c1d93cf18b2b4002a7))
* correct sub-agents ([95ea4a2](https://github.com/e0ipso/drupal-bridge-mcp/commit/95ea4a2a3412608b301e9d475d664f2b19849a31))
* create .claude & .gemini folders ([d46d6ef](https://github.com/e0ipso/drupal-bridge-mcp/commit/d46d6ef8cdda300979ce24d5f402d33a480a6a2a))
* ignore more things ([183153f](https://github.com/e0ipso/drupal-bridge-mcp/commit/183153f112bd04a3ef304cbbe185c73aa0e299fd))
* improve dev container ([109643f](https://github.com/e0ipso/drupal-bridge-mcp/commit/109643f0a0d203aa34b9d90be5abdb9c39100660))
* make test pass ([876ad22](https://github.com/e0ipso/drupal-bridge-mcp/commit/876ad222d9a563339cebf69e12a9339c997fbb4d))
* more cleanup ([9ad10be](https://github.com/e0ipso/drupal-bridge-mcp/commit/9ad10befde2aebd7e4cc8d614b42f26a420bf91f))
* more cleanup ([aa89829](https://github.com/e0ipso/drupal-bridge-mcp/commit/aa8982930d95904628267305769a191dda7fa445))
* multiple streamable http issues ([7400151](https://github.com/e0ipso/drupal-bridge-mcp/commit/7400151e6071e77bb13adae4025d39769fda4bbc))
* remove cache files ([5f6a70e](https://github.com/e0ipso/drupal-bridge-mcp/commit/5f6a70ee5e8688001671fdfa6739588a02c954e3))
* remove legacy code ([feaf862](https://github.com/e0ipso/drupal-bridge-mcp/commit/feaf862ac8d4ba3989ec61766c4b882488d8805d))
* remove more dead code ([8365907](https://github.com/e0ipso/drupal-bridge-mcp/commit/83659071c89dd205a09fe0cab1551b02eaca396f))
* remove this documentation inaccuracy ([e9f3d8b](https://github.com/e0ipso/drupal-bridge-mcp/commit/e9f3d8b9548acd06a8c8f4038585d20ec4c7d1ef))
* rename the server ([3a5f666](https://github.com/e0ipso/drupal-bridge-mcp/commit/3a5f66646406b7440850c4d622e80fa7d4625c5a))
* resolve TypeScript errors in endpoint discovery ([90ea3ff](https://github.com/e0ipso/drupal-bridge-mcp/commit/90ea3ff4c8bdb58916bd5e9baeda5bbc35d69f8c))
* restore package.json scripts after corruption during hook testing ([a24c04c](https://github.com/e0ipso/drupal-bridge-mcp/commit/a24c04c770270118a222876c4a2e1b363deb90f4))
* start over ([b2f2972](https://github.com/e0ipso/drupal-bridge-mcp/commit/b2f2972d5a751badc3b7e9484923c13a5be45afe))
* tsc types ([a19caa2](https://github.com/e0ipso/drupal-bridge-mcp/commit/a19caa20947647acbc50942382560f8d9701006c))
* update AI task manager ([c5cf96f](https://github.com/e0ipso/drupal-bridge-mcp/commit/c5cf96fcea0aa6154b717e040719266ff4e76ee3))
* update dev command ([9eb8da1](https://github.com/e0ipso/drupal-bridge-mcp/commit/9eb8da1719537ebb05fae458053844d1858fe532))


### Features

* add 100k agents ([34f9b7d](https://github.com/e0ipso/drupal-bridge-mcp/commit/34f9b7d47cc05d7d6124272342e39c0243c4764d))
* add logging and debugging ([b9a8dbf](https://github.com/e0ipso/drupal-bridge-mcp/commit/b9a8dbf7e5fc505be82663ac6d0faaed343a69be))
* add plans folder ([2ae8258](https://github.com/e0ipso/drupal-bridge-mcp/commit/2ae8258aedfda585c83bbafebd5cffb94617170d))
* **auth:** complete phase 1 - conditional OAuth discovery ([00646a9](https://github.com/e0ipso/drupal-bridge-mcp/commit/00646a95f69bd2cb183d8ec8c1a9ed8bdaefcee0))
* **auth:** complete phase 2 - conditional OAuth provider creation ([a12ad6a](https://github.com/e0ipso/drupal-bridge-mcp/commit/a12ad6a2705150c05ae194c0cf9333cf13dca3ad))
* **auth:** complete phase 3 - server OAuth provider integration ([d74b6ee](https://github.com/e0ipso/drupal-bridge-mcp/commit/d74b6ee4190e2f7305937bdaedd3da931cfca82e))
* **auth:** complete phase 4 - authentication tool disabled responses ([6d0c75b](https://github.com/e0ipso/drupal-bridge-mcp/commit/6d0c75bdb2bdfad246b5e1870bcfb74594f42ee2))
* **auth:** complete phase 5 - comprehensive authentication mode testing ([be2b675](https://github.com/e0ipso/drupal-bridge-mcp/commit/be2b67569354b59f561601b3f42037a4c4dd261f))
* Complete database and authentication foundation for MCP server ([118edb7](https://github.com/e0ipso/drupal-bridge-mcp/commit/118edb7913ca84e97a282b202bfdcf74d8af2488))
* complete foundation validation with comprehensive test suite ([79b5839](https://github.com/e0ipso/drupal-bridge-mcp/commit/79b583993ae1e901cc61e526d533454cb38f4652))
* complete infrastructure documentation with comprehensive ADRs ([1814fdd](https://github.com/e0ipso/drupal-bridge-mcp/commit/1814fdddf80c33a427e6a36349faf6ea9fd486af))
* complete Phase 1 dead code cleanup tasks ([ac8486d](https://github.com/e0ipso/drupal-bridge-mcp/commit/ac8486d8e25fd2662a2da0a80d915b842bd20933))
* complete Phase 2 export/import cleanup ([11cb6d3](https://github.com/e0ipso/drupal-bridge-mcp/commit/11cb6d34492aa089e660bcf45797707a65959bf9))
* complete Phase 3 validation and leftover cleanup ([044357b](https://github.com/e0ipso/drupal-bridge-mcp/commit/044357bb87cd52fd964b18b0d77a88f1e3fa10e1))
* complete repository configuration and release automation ([85a0097](https://github.com/e0ipso/drupal-bridge-mcp/commit/85a0097be9bbb023aeb86c07646c423d9be2c2a6))
* comprehensive error handling and integration testing ([8b3d80f](https://github.com/e0ipso/drupal-bridge-mcp/commit/8b3d80f7afc9aff66b46e614703526604d7b93b0))
* **config:** add HTTP transport configuration ([6363cca](https://github.com/e0ipso/drupal-bridge-mcp/commit/6363cca02fce985afc8c4f114f728baf361d7ea6))
* **config:** simplify OAuth configuration and integrate MCP server ([f30dded](https://github.com/e0ipso/drupal-bridge-mcp/commit/f30dded36c1c07adb07c88fc2ceb6a5f53917555))
* configure comprehensive development tooling and core dependencies ([e0ae42a](https://github.com/e0ipso/drupal-bridge-mcp/commit/e0ae42abe45b450b35524bf3e0af2f50c6cf96e3))
* establish Node.js/TypeScript project foundation ([148d8c3](https://github.com/e0ipso/drupal-bridge-mcp/commit/148d8c31121e38815a4be569cbc4b9865a51d2ac))
* implement basic MCP server foundation ([70c88a5](https://github.com/e0ipso/drupal-bridge-mcp/commit/70c88a5a2c0f2a0f8d19843cf025a94fe34357b3))
* implement CI/CD foundation with Docker containerization ([afc40d9](https://github.com/e0ipso/drupal-bridge-mcp/commit/afc40d936c40d8a9fb6543fbca0d62055ec3d82b))
* implement comprehensive Node.js tooling setup ([ef327d1](https://github.com/e0ipso/drupal-bridge-mcp/commit/ef327d1fb6e946d8176ed8a3698a0cc9fb82c302))
* implement comprehensive security and monitoring infrastructure ([ba0f9fd](https://github.com/e0ipso/drupal-bridge-mcp/commit/ba0f9fd220de376400f3eb4afd7a263bc5554d23))
* implement JSON-RPC 2.0 communication with Drupal endpoint ([bddb498](https://github.com/e0ipso/drupal-bridge-mcp/commit/bddb498eb1d791af0547f554ca6b2d2a2fa719d9))
* implement OAuth 2.1 MCP server integration ([0dbbfeb](https://github.com/e0ipso/drupal-bridge-mcp/commit/0dbbfebf558b7283a514e02ef93adbeb621fb2fc))
* implement Phase 1 MCP protocol foundation tasks ([8472f41](https://github.com/e0ipso/drupal-bridge-mcp/commit/8472f41575e4edf069ea71bcaee3a4343e5232a8))
* implement Phase 2 MCP protocol handler ([50e7c41](https://github.com/e0ipso/drupal-bridge-mcp/commit/50e7c4162923a5f778dacdf6b5a90e1233d64b1d))
* implement Phase 3 tool registration system ([931cae0](https://github.com/e0ipso/drupal-bridge-mcp/commit/931cae06feb1cb689f7c8eba292c27958f7265b9))
* implement Phase 4 integration testing suite ([257b5a3](https://github.com/e0ipso/drupal-bridge-mcp/commit/257b5a3a7951482db506f91ba7e49343fdd12ac8))
* implement Railway cloud deployment configuration ([e357d93](https://github.com/e0ipso/drupal-bridge-mcp/commit/e357d93bbd45f195a16a4a4b6db1c35369cdd39a))
* implement RFC 8628 device authorization grant flow ([7791204](https://github.com/e0ipso/drupal-bridge-mcp/commit/77912041ad55d99fbde1de2f830237573d8ece56))
* implement RFC8414 OAuth 2.1 endpoint discovery ([7f795d4](https://github.com/e0ipso/drupal-bridge-mcp/commit/7f795d4868dbe418eace244a1b28d9bcd0afdc02))
* implement search_tutorials MCP tool with comprehensive validation ([64496cb](https://github.com/e0ipso/drupal-bridge-mcp/commit/64496cb8771ddef89ab35333b3580f5f23772e25))
* improve implementation ([e7d2278](https://github.com/e0ipso/drupal-bridge-mcp/commit/e7d227855590b8de809368f840dd56e8a9626d77))
* initialize Node.js/TypeScript project with MCP and JSON-RPC dependencies ([370d906](https://github.com/e0ipso/drupal-bridge-mcp/commit/370d9066c7dd7d3bb97fffb5899337ca256e5f25))
* **logging:** implement centralized Pino logger utility ([cd5fbca](https://github.com/e0ipso/drupal-bridge-mcp/commit/cd5fbcacdbf407934e1a447b0aa762054b820fb7))
* **logging:** replace console logging with structured Pino logging ([aef3f5f](https://github.com/e0ipso/drupal-bridge-mcp/commit/aef3f5ff430fbca89d515bd3bebe7a6847fe79c2))
* **main:** migrate from stdio to HTTP transport ([5c7d89a](https://github.com/e0ipso/drupal-bridge-mcp/commit/5c7d89a5d98ca6f0b15ae427cafbf9c4ee7746e4))
* make the MCP server mini-minimal ([7b7541e](https://github.com/e0ipso/drupal-bridge-mcp/commit/7b7541e19b14d9cb33761b39d54831b737d1e178))
* **oauth:** implement OAuth 2.1 foundation with MCP SDK and endpoint discovery ([2222f15](https://github.com/e0ipso/drupal-bridge-mcp/commit/2222f153bac2dff6f5813d80ca2f4b2eb37a71f8))
* simplify MVPD ([d017369](https://github.com/e0ipso/drupal-bridge-mcp/commit/d0173695c8815a59420e0187ecf45ca17d74492d))
* **transport:** add MCP JSON-RPC protocol handling ([efbcbcc](https://github.com/e0ipso/drupal-bridge-mcp/commit/efbcbccb1c15f465b5d4f7229a94ecaa2feda683))
* **transport:** implement basic HTTP server infrastructure ([b7ef884](https://github.com/e0ipso/drupal-bridge-mcp/commit/b7ef884ba334c3e84dffd8c9b13634b90d514752))
* **transport:** implement Server-Sent Events streaming for MCP JSON-RPC ([ab3bf2c](https://github.com/e0ipso/drupal-bridge-mcp/commit/ab3bf2ca10ccc76bb9817c84028f2569ee11ad46))
* **transport:** implement SSE streaming with robust error handling ([4e7b1c2](https://github.com/e0ipso/drupal-bridge-mcp/commit/4e7b1c2c3120ffe65d0913567d7b2ea2033fe518))
* **transport:** remove custom JSON-RPC components ([936a114](https://github.com/e0ipso/drupal-bridge-mcp/commit/936a11450ec36bea5bad4a9a67d7475b53ab41ea))
* update task manager ([6e1d347](https://github.com/e0ipso/drupal-bridge-mcp/commit/6e1d34749a9337bbc55e980fa4a596790a791a9c))
