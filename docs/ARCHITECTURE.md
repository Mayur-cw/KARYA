# Architecture
```mermaid
flowchart LR
Browser[React UI] --> API[Express API]
API --> Schemas[Shared Zod]
API --> Repository[Repository interface]
Repository --> InMemory[Memory in demo/tests]
Repository --> Firestore[Firestore production adapter after implementation]
```
Trust boundary is the Express API. Client role checks are only hints. All object-level authorization belongs in server business logic. Production Firestore binding is a required project task; not included in the starter.
