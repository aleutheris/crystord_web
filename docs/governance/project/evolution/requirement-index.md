# Requirements Index

Canonical index of all Crystord App requirements.

Status values (per `docs/governance/generic/process/artifact-model.md`): `Proposed` | `Active` | `Superseded by <id>` | `Withdrawn`.
A terminal requirement (`Superseded by <id>` / `Withdrawn`) keeps a tombstone row here; under the v2 archival lifecycle its file moves to `requirements/superseded/` once no active record still references it.

| Requirement ID | Title | Class | Status | Related ADRs | Related BIs |
| --- | --- | --- | --- | --- | --- |
| REQ-FR-260001 | Graph-First Control Surface for Backend-Supported Operations | FR | Active | ADR-260001 | BI-260001 |
| REQ-FR-260002 | Primary User Focus on Data Transparency and Relationship Understanding | FR | Active | ADR-260001 | BI-260001 |
| REQ-FR-260003 | Core Atom and Bond Manipulation in Graph Workspace | FR | Active | ADR-260002 | BI-260002 |
| REQ-FR-260004 | Label Search and Graph Inspection Experience | FR | Active | ADR-260002 | BI-260002 |
| REQ-FR-260005 | Backend Contract for Essential Atom and Bond Operations | FR | Active | ADR-260003 | BI-260003 |
| REQ-FR-260006 | Read-Only Label Querying and Metadata Inspection | FR | Active | ADR-260003 | BI-260003 |
| REQ-FR-260008 | Full Workspace Navigation and Side-Panel Editing | FR | Active | ADR-260014 | BI-260011 |
| REQ-FR-260009 | Canvas Visualization Modes and In-Workspace View Switching | FR | Active | ADR-260015 | BI-260012 |
| REQ-FR-260010 | Direct-Manipulation Primitives and Canvas-First Creation | FR | Active | ADR-260015 | BI-260012 |
| REQ-FR-260011 | MVP Search Controls and Query Transparency | FR | Active | ADR-260016 | BI-260013 |
| REQ-FR-260012 | Combined Graph and Side-Panel Search Result Presentation | FR | Active | ADR-260016 | BI-260013 |
| REQ-FR-260013 | MVP Top-Level Areas and Shell Routing Structure | FR | Active | ADR-260017 | BI-260014 |
| REQ-FR-260014 | Feature-Bounded Modules and Content Ownership Model | FR | Active | ADR-260017 | BI-260014 |
| REQ-FR-260015 | Feature-Sliced Frontend Architecture and Rendering Model | FR | Active | ADR-260018 | BI-260015 |
| REQ-FR-260016 | State Partitioning and Dependency-Boundary Enforcement | FR | Active | ADR-260018 | BI-260015 |
| REQ-FR-260017 | MVP Framework, Routing, and Runtime Stack Baseline | FR | Active | ADR-260019 | BI-260016 |
| REQ-FR-260018 | MVP Graph UI/Data/Test Stack Integration Baseline | FR | Active | ADR-260019 | BI-260016 |
| REQ-FR-260019 | MVP Critical End-to-End Acceptance Flows | FR | Active | ADR-260020 | BI-260017 |
| REQ-FR-260020 | Extensibility Seams for Anticipated Post-MVP Capabilities | FR | Active | ADR-260021 | BI-260018 |
| REQ-FR-260021 | Adapter-Based Resilience for Data Model Evolution | FR | Active | ADR-260021 | BI-260018 |
| REQ-FR-260022 | Blank-First Workspace Entry with Explicit Search Activation | FR | Active | ADR-260023 | BI-260020 |
| REQ-FR-260023 | Pre-Search Visibility of Recommended Labels | FR | Active | ADR-260016 | BI-260021 |
| REQ-FR-260024 | Search Execution on Enter Key | FR | Active | ADR-260023 | BI-260023 |
| REQ-FR-260025 | Multi-Label Chip Input with Space/Colon Delimiters | FR | Active | ADR-260023 | BI-260023 |
| REQ-FR-260026 | Fresh Backend-Executed Search Results on Submit | FR | Active | ADR-260016, ADR-260023 | BI-260024 |
| REQ-FR-260027 | No Graph Re-Scoping While Search Input Is Being Edited | FR | Active | ADR-260016, ADR-260023 | BI-260025 |
| REQ-FR-260028 | Auto-Chip Incomplete Text on Enter | FR | Active | ADR-260027 | BI-260027 |
| REQ-FR-260029 | Always-Fresh Backend Query on Every Search Submission | FR | Active | ADR-260027 | BI-260028 |
| REQ-FR-260030 | Dual Graph Views with Network-First Default and Shared Search Dataset | FR | Active | ADR-260028 | BI-260029 |
| REQ-FR-260032 | Dual-View Shared Dataset and Cross-View Selection Consistency | FR | Active | ADR-260030 | BI-260031 |
| REQ-FR-260033 | Keyboard and Discoverability Support for Dual Graph Views | FR | Active | ADR-260031 | BI-260032 |
| REQ-FR-260034 | Dual-View Validation Coverage Must Include Unit, Integration, and E2E Paths | FR | Active | ADR-260032 | BI-260033 |
| REQ-FR-260035 | Network View Bonds Must Anchor at Geometrically Closest Circle Boundary Points | FR | Active | ADR-260033, ADR-260029 | BI-260034 |
| REQ-FR-260036 | Network View Bonds Must Show Direction with Arrowheads | FR | Active | ADR-260034 | BI-260035 |
| REQ-FR-260037 | Network View Must Apply Topology-Aware Automatic Layout | FR | Active | ADR-260035 | BI-260036 |
| REQ-FR-260038 | Network View Outer-Circumference Edge Initiation and Hover Selection Affordance | FR | Active | ADR-260036 | BI-260037, BI-260038 |
| REQ-FR-260039 | Network View Connection Drag Preview Must Render as a Straight Line | FR | Active | ADR-260037 | BI-260039 |
| REQ-FR-260040 | Network View Magnetic Attach Must Activate Only on Target Atom Hit Area | FR | Active | ADR-260038 | BI-260040 |
| REQ-FR-260041 | Network View Drag-Time Target Snap Must Use Nearest-Boundary Geometry | FR | Active | ADR-260038, ADR-260033 | BI-260041 |
| REQ-FR-260042 | Network View Selected-State Must Not Force Outer Initiation Ring Visibility | FR | Active | ADR-260038 | BI-260041 |
| REQ-FR-260043 | Bond-Name Dialog Keyboard Input Must Not Trigger Canvas Deletion Flows | FR | Active | ADR-260015, ADR-260031 | BI-260042 |
| REQ-FR-260045 | Flow View Relayout Control and State Preservation | FR | Active | ADR-260039 | BI-260044 |
| REQ-FR-260046 | Flow View Edge and Handle Visual Grammar | FR | Active | ADR-260039 | BI-260044 |
| REQ-FR-260047 | Flow View Projection Mode Toggle and Non-Flow Atom Inclusion | FR | Active | ADR-260040 | BI-260045 |
| REQ-FR-260054 | User Sign-Up with Email and Password | FR | Active | ADR-260048 | BI-260048 |
| REQ-FR-260055 | User Sign-In with Email and Password | FR | Active | ADR-260048 | BI-260048 |
| REQ-FR-260056 | Google Sign-In Button Must Use Official GIS SDK | FR | Active | ADR-260048 | BI-260048 |
| REQ-FR-260057 | User Sign-In with Username or Email | FR | Proposed | ADR-260049 | BI-260049 |
| REQ-FR-260058 | Password-Based Sign-In Form | FR | Proposed | ADR-260049 | BI-260049 |
| REQ-OR-260001 | MVP Demo Sign-In Operating Model | OR | Active | ADR-260002, ADR-260014 | BI-260002, BI-260011 |
| REQ-OR-260002 | GraphQL Schema Stability and Versioning Contract | OR | Active | ADR-260013 | BI-260010 |
| REQ-OR-260003 | Frontend Contract Stability and Breaking-Change Control | OR | Active | ADR-260018 | BI-260015 |
| REQ-OR-260004 | Build, Tooling, and Auth-Evolution Operational Criteria | OR | Active | ADR-260019 | BI-260016 |
| REQ-OR-260005 | MVP Observability, Release Gate, and Rollback Operations | OR | Active | ADR-260020 | BI-260017 |
| REQ-OR-260006 | Evolution Governance and Change-Budget Discipline | OR | Active | ADR-260021 | BI-260018 |
| REQ-OR-260007 | Suggested Label Source Uses Existing list_labels Query (Temporary) | OR | Active | ADR-260016 | BI-260022 |
| REQ-OR-260008 | Search Filtering Delegates to Backend GraphQL Without Overfetch | OR | Active | ADR-260016, ADR-260023 | BI-260024 |
| REQ-OR-260009 | Bond Mutation Client Contract Must Match the Schema Selector Type | OR | Active | ADR-260003, ADR-260015 | BI-260026 |
| REQ-OR-260010 | Dual-View Mutation Reflection Must Be Centralized in Shared Graph State | OR | Active | ADR-260030 | BI-260031 |
| REQ-OR-260011 | Dual-View Rollout Must Be Feature-Flag Controlled with Immediate Fallback | OR | Active | ADR-260032 | BI-260033 |
| REQ-OR-260012 | Authentication Must Use JWTs Stored in localStorage | OR | Active | ADR-260048 | BI-260048 |
| REQ-CR-260001 | MVP Scope Exclusions for Graph Experience | CR | Active | ADR-260002 | BI-260002 |
| REQ-CR-260002 | Backend Error Handling and Resilience Baseline | CR | Active | ADR-260003 | BI-260003 |
| REQ-CR-260003 | Desktop-Only MVP and Minimal Placeholder Policy | CR | Active | ADR-260014 | BI-260011 |
| REQ-CR-260004 | MVP Deletion Safety Constraints for Graph Editing | CR | Active | ADR-260015 | BI-260012 |
| REQ-CR-260005 | Search Feature Deferral Boundaries | CR | Active | ADR-260016 | BI-260013 |
| REQ-CR-260006 | MVP Architecture Scope and Extension Constraints | CR | Active | ADR-260017 | BI-260014 |
| REQ-CR-260007 | MVP Frontend Architecture Boundary Constraints | CR | Active | ADR-260018 | BI-260015 |
| REQ-CR-260008 | Stack Rejection and Scope Constraints for MVP | CR | Active | ADR-260019 | BI-260016 |
| REQ-CR-260009 | MVP Placeholder and Fallback Trust Constraints | CR | Active | ADR-260020 | BI-260017 |
| REQ-CR-260010 | MVP Growth Boundary and Migration Safety Constraints | CR | Active | ADR-260021 | BI-260018 |
| REQ-CR-260011 | Branding Governance and Semantic Usage Constraint | CR | Active | ADR-260022 | BI-260019, BI-260055 |
| REQ-CR-260012 | Suggested Label Display Cap of Three (Temporary) | CR | Active | ADR-260016 | BI-260022 |
| REQ-CR-260013 | Autocomplete and Incremental Search Behaviors Are Deferred | CR | Active | ADR-260016, ADR-260023 | BI-260025 |
| REQ-CR-260014 | View-Switching Must Not Change Shell and Panel Contracts | CR | Active | ADR-260028 | BI-260029 |
| REQ-CR-260016 | Dual-View Tabs Must Follow ARIA Tab Pattern with Visible Focus | CR | Active | ADR-260031 | BI-260032 |
| REQ-CR-260017 | Network View Ring Visual Semantics Must Use Distinct Tokenized Colors | CR | Active | ADR-260037 | BI-260039 |
| REQ-CR-260018 | Atom Keyboard Deletion Must Be Delete-Key Only | CR | Active | ADR-260015, ADR-260031 | BI-260042 |
| REQ-QR-260001 | MVP Graph Interaction Performance Baseline | QR | Active | ADR-260015 | BI-260012 |
| REQ-QR-260002 | MVP Accessibility and Reliability Quality Baseline | QR | Active | ADR-260020 | BI-260017 |
| REQ-QR-260003 | Large-Graph Degrade Policy for Dual-View Rendering | QR | Active | ADR-260030 | BI-260031 |
| REQ-QR-260004 | Dual-View Visual States Must Be Contrast-Safe and Non-Color-Only | QR | Active | ADR-260031 | BI-260032 |
| REQ-QR-260005 | Dual-View Switch Performance Targets and Large-Render Gate Timing | QR | Active | ADR-260032 | BI-260033 |
| REQ-FR-260060 | Passwordless Google Sign-In | FR | Proposed | ADR-260050 | BI-260050 |
| REQ-FR-260061 | One-Click Demo Mode | FR | Proposed | ADR-260050 | BI-260050 |
| REQ-CR-260020 | Unified Authentication UI | CR | Proposed | ADR-260050 | BI-260050, BI-260055 |
| REQ-QR-260007 | Authentication Security and Reliability | QR | Proposed | ADR-260050 | BI-260050 |
| REQ-FR-260062 | Accept Platform Token from URL Parameter on Redirect | FR | Active | ADR-260052 | BI-260051 |
| REQ-CR-260021 | URL Token Parameter Must Be Stripped from URL Immediately After Consumption | CR | Active | ADR-260052 | BI-260051 |
| REQ-OR-260015 | URL Token Handoff Must Apply Regardless of Existing Session State | OR | Active | ADR-260052 | BI-260051 |
| REQ-CR-260022 | Auth Entry Screen Must Use Two-Column Auth + Demo Panel Layout | CR | Active | ADR-260053 | BI-260052 |
| REQ-FR-260063 | Verify-First Account Sign-Up | FR | Proposed | ADR-260055 | BI-260055 |
| REQ-FR-260064 | Session Lifecycle and Re-Authentication | FR | Proposed | ADR-260056 | BI-260056 |
| REQ-FR-260065 | Self-Service Password Reset | FR | Proposed | ADR-260058 | BI-260057 |
| REQ-FR-260066 | Google Account Linking and Unlinked-Account Recovery | FR | Proposed | ADR-260058 | BI-260056, BI-260059 |
| REQ-FR-260067 | Account Management and Identity Settings | FR | Proposed | ADR-260058 | BI-260058, BI-260059, BI-260060 |
| REQ-FR-260068 | Authenticated Data and Taxonomy Reads | FR | Proposed | ADR-260057 | BI-260054 |
| REQ-FR-260069 | Read-Side Access-Level Affordance Gating | FR | Proposed | ADR-260059 | BI-260061 |
| REQ-OR-260016 | Authentication & Authorization Backend Contract (Schema 8.1.0) | OR | Proposed | ADR-260054 | BI-260054 |
| REQ-OR-260017 | Backend Schema Compatibility Pinned to ~8.1.0 | OR | Proposed | ADR-260054 | BI-260054 |
| REQ-CR-260023 | Client-Side Username and Password Validation Parity | CR | Proposed | ADR-260055 | BI-260055 |
| REQ-CR-260024 | Anti-Enumeration Authentication Messaging | CR | Proposed | ADR-260055 | BI-260055, BI-260057 |
| REQ-CR-260025 | Centralized GraphQL Error-Code Interpretation | CR | Proposed | ADR-260057 | BI-260054 |
| REQ-CR-260026 | Rate-Limit Handling and Back-Off | CR | Proposed | ADR-260057 | BI-260056 |
| REQ-QR-260008 | Authentication & Authorization Security, Reliability, and Coverage | QR | Proposed | ADR-260054 | BI-260054, BI-260055, BI-260056, BI-260057, BI-260058, BI-260059, BI-260060, BI-260061 |
| REQ-FR-260070 | Table View as a Registered Center View with Inline Editing | FR | Active | ADR-260062, ADR-260032 | EPIC-260071 |
| REQ-FR-260071 | Classify Inspector with Label and Category Chip Editing | FR | Active | ADR-260063 | EPIC-260067 |
| REQ-FR-260072 | Categories Navigator with Faceted Working-Set Scoping | FR | Active | ADR-260064 | EPIC-260068 |
| REQ-FR-260073 | Compute Formula Builder with Evaluation Transparency | FR | Active | ADR-260065 | EPIC-260069 |

## Superseded

Terminal requirements (replaced by a successor). Their record files live under
`requirements/superseded/`; retained for audit per
`docs/governance/generic/process/artifact-model.md`.

| Requirement ID | Title | Class | Status | Related ADRs | Related BIs |
| --- | --- | --- | --- | --- | --- |
| REQ-FR-260007 | Graph-First Interaction with Search Bootstrap | FR | Superseded by REQ-FR-260022 | ADR-260014 | BI-260011, BI-260020 |
| REQ-FR-260031 | Network View Circle Nodes and Connector-Based Edge Creation | FR | Superseded by REQ-FR-260038 | ADR-260029 | BI-260030 |
| REQ-FR-260044 | Flow View Directional Projection and Eligible-Bond Inclusion | FR | Superseded by REQ-FR-260047 | ADR-260039, ADR-260040 | BI-260044, BI-260045 |
| REQ-OR-260013 | Temporary Authentication Compatibility | OR | Superseded by REQ-FR-260063, REQ-OR-260016 | ADR-260049, ADR-260055 | BI-260049, BI-260055 |
| REQ-CR-260015 | Network View Must Use Circle Nodes with Visible Connector Handles | CR | Superseded by REQ-FR-260038 | ADR-260029 | BI-260030 |
| REQ-FR-260059 | Credential-Based Sign-Up and Sign-In | FR | Superseded by REQ-FR-260063 | ADR-260050, ADR-260055 | BI-260050, BI-260055 |
| REQ-OR-260014 | Authentication Backend Contract | OR | Superseded by REQ-OR-260016 | ADR-260050, ADR-260054 | BI-260050, BI-260054 |
