# Automated Release Setup

This repository has been configured with automated releases using semantic-release and GitHub
Actions.

## GitHub Actions Workflows

### 1. CI Workflow (`ci.yml`)

- **Triggers**: Pull requests to `main`, `beta`, and `alpha` branches
- **Jobs**:
  - Quality checks (type checking, linting, formatting)
  - Tests across Node.js versions 18, 20, and 21
- **Purpose**: Ensures code quality before merging

### 2. Release Workflow (`release.yml`)

- **Triggers**: Push to `main`, `beta`, and `alpha` branches
- **Jobs**:
  - Quality checks (same as CI)
  - Tests across Node.js versions 18, 20, and 21
  - Automated release (only on push events, after successful quality and test jobs)
- **Purpose**: Automated versioning and publishing

## Required Repository Secrets

To enable automated publishing to NPM, you need to add the following secret to your GitHub
repository:

### NPM_TOKEN

1. Go to [npmjs.com](https://www.npmjs.com) and login
2. Go to Access Tokens in your account settings
3. Generate a new **Automation** token (not Classic)
4. Copy the token
5. In your GitHub repository, go to Settings > Secrets and variables > Actions
6. Click "New repository secret"
7. Name: `NPM_TOKEN`
8. Value: [paste your NPM token]

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions.

## How Releases Work

### Branch Strategy

- **`main`**: Production releases (1.0.0, 1.1.0, 2.0.0)
- **`beta`**: Beta releases (1.1.0-beta.1, 1.1.0-beta.2)
- **`alpha`**: Alpha releases (1.1.0-alpha.1, 1.1.0-alpha.2)

### Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Examples:

- `feat: add new authentication method` → Minor version bump
- `fix: resolve OAuth token refresh issue` → Patch version bump
- `feat!: change API response format` → Major version bump (breaking change)
- `docs: update README` → No release (documentation only)

### Release Process

1. Push commits with conventional commit messages to `main`, `beta`, or `alpha`
2. GitHub Actions runs quality checks and tests
3. If all checks pass, semantic-release:
   - Analyzes commit messages to determine version bump
   - Generates changelog
   - Creates GitHub release
   - Publishes to NPM
   - Commits updated files back to repository

## Semantic Release Configuration

The release configuration is in `.releaserc.json` and includes:

- **Commit Analysis**: Determines version bump from commit messages
- **Changelog Generation**: Updates CHANGELOG.md
- **NPM Publishing**: Publishes to npm registry
- **GitHub Releases**: Creates GitHub releases with notes
- **Git Updates**: Commits version and changelog updates

## Testing the Setup

1. Ensure `NPM_TOKEN` is added to repository secrets
2. Make a commit with a conventional commit message to a feature branch
3. Create a pull request to `main` → CI workflow should run
4. Merge the pull request → Release workflow should run and publish if version bump is detected

## Node.js Version Support

- **Development**: Node.js 20+ (as specified in `package.json` engines)
- **CI/CD**: Tests on Node.js 18, 20, and 21
- **Release**: Uses Node.js 20 for consistency
