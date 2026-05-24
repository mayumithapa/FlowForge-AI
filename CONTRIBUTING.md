# Contributing to FlowForge-AI

Thank you for your interest in contributing to FlowForge-AI! We welcome contributions from everyone. This document provides guidelines and instructions for contributing.

## 🎯 Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## 📋 Before You Start

- Check existing [Issues](https://github.com/mayumithapa/FlowForge-AI/issues) and [Pull Requests](https://github.com/mayumithapa/FlowForge-AI/pulls)
- Read the [README.md](README.md) to understand the project
- Review the [architecture documentation](README.md#-architecture)

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm 7+
- PostgreSQL 12+
- Docker (recommended)

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/mayumithapa/FlowForge-AI.git
cd FlowForge-AI

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Update .env with your local configuration
# - Database credentials
# - API keys (OpenAI, etc.)
# - RabbitMQ connection string

# Start services (Docker recommended)
docker-compose up -d

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

## 🔄 Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch naming conventions:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `chore/description` - Maintenance tasks
- `test/description` - Test additions

### 2. Make Your Changes

- Keep commits **small and focused**
- Write clear, descriptive commit messages
- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (formatting, missing semicolons, etc)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, or tooling

**Example:**
```
feat(workflow): add webhook retry mechanism

- Implement exponential backoff for failed webhooks
- Add configurable retry limits
- Improve logging for webhook events

Closes #123
```

### 4. Testing

```bash
# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Format code
npm run format
```

**Coverage Requirements:**
- Minimum 80% line coverage
- All public APIs must have tests
- Integration tests for critical workflows

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Visit the repository and create a Pull Request with:
- **Clear title** describing the change
- **Detailed description** of what and why
- **Related issues** (Closes #123)
- **Testing notes** - how to test the changes
- **Screenshots/GIFs** for UI changes

## 📐 Code Style Guidelines

### JavaScript/TypeScript

```typescript
// Use TypeScript for type safety
interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
}

// Use arrow functions
const processWorkflow = (workflow: Workflow) => {
  // Implementation
};

// Use const by default
const DEFAULT_TIMEOUT = 30000;

// JSDoc comments for public APIs
/**
 * Process a workflow trigger
 * @param workflow - The workflow to process
 * @returns Promise that resolves when complete
 */
export const processTrigger = async (workflow: Workflow): Promise<void> => {
  // Implementation
};
```

### React Components

```typescript
import React from 'react';

interface ComponentProps {
  title: string;
  onSave: (data: any) => void;
}

/**
 * WorkflowCard component
 */
const WorkflowCard: React.FC<ComponentProps> = ({ title, onSave }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onSave({ title });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="workflow-card">
      <h2>{title}</h2>
      <button onClick={handleClick} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
};

export default WorkflowCard;
```

### Backend Services

```typescript
// Use NestJS controllers and services
import { Controller, Post, Body } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  @Post()
  async create(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowService.create(createWorkflowDto);
  }
}

// Use dependency injection
@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    private eventsService: EventsService,
  ) {}

  async create(data: CreateWorkflowDto): Promise<Workflow> {
    const workflow = this.workflowRepository.create(data);
    await this.workflowRepository.save(workflow);
    await this.eventsService.emit('workflow.created', workflow);
    return workflow;
  }
}
```

## 🧪 Testing Guidelines

```typescript
// Use Jest for testing
describe('WorkflowService', () => {
  let service: WorkflowService;
  let repository: Repository<Workflow>;

  beforeEach(async () => {
    // Setup
  });

  it('should create a workflow', async () => {
    const input = { name: 'Test Workflow' };
    const result = await service.create(input);
    expect(result.name).toBe('Test Workflow');
  });

  it('should emit workflow.created event', async () => {
    const emitSpy = jest.spyOn(eventsService, 'emit');
    await service.create({ name: 'Test' });
    expect(emitSpy).toHaveBeenCalledWith('workflow.created', expect.any(Object));
  });
});
```

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Title**: Clear, descriptive title
2. **Environment**: Node version, OS, browser (if applicable)
3. **Steps to Reproduce**: Detailed steps to reproduce the issue
4. **Expected Behavior**: What should happen
5. **Actual Behavior**: What actually happens
6. **Screenshots/Logs**: Relevant screenshots or error logs

## 💡 Suggesting Enhancements

When suggesting features:

1. **Title**: Clear, descriptive title
2. **Problem Statement**: What problem does this solve?
3. **Proposed Solution**: How should this work?
4. **Alternatives Considered**: Other approaches you've thought of
5. **Additional Context**: Any other relevant information

## 📝 Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for structural changes
- Add JSDoc comments to all public APIs
- Keep examples up-to-date
- Document new environment variables

## 🔄 Pull Request Process

1. Update your branch with latest main: `git rebase origin/main`
2. Ensure all tests pass: `npm run test`
3. Ensure linting passes: `npm run lint`
4. Push your changes
5. Create/update the PR with a detailed description
6. Address review comments
7. Maintainers will merge when approved

## ✅ PR Review Checklist

- [ ] Tests added/updated
- [ ] Coverage maintained (80%+)
- [ ] Documentation updated
- [ ] No breaking changes (or justified)
- [ ] Code follows style guidelines
- [ ] Commit messages are clear
- [ ] No merge conflicts

## 🚀 Release Process

Releases are managed by project maintainers:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Tag release: `git tag v1.0.0`
4. Push tag to trigger release workflow
5. GitHub Actions will build and publish

## 📚 Additional Resources

- [Architecture Guide](README.md#-architecture)
- [API Documentation](docs/api.md)
- [Development Setup](README.md#-quick-start)
- [Troubleshooting](docs/troubleshooting.md)

## ❓ Questions?

- Open a [Discussion](https://github.com/mayumithapa/FlowForge-AI/discussions)
- Email: mayumi1509thapa@gmail.com
- Check existing [Issues](https://github.com/mayumithapa/FlowForge-AI/issues)

---

Thank you for contributing to FlowForge-AI! 🎉

