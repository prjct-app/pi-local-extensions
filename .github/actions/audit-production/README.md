# Audit Pi runtime dependencies

A shared CI action for Pi extensions. It builds a temporary installation from the package's normal and optional dependencies, uses the same peer suppression as `pi install`, and runs `npm audit` on the resulting runtime graph. Any installation or audit failure fails the action. Lifecycle scripts are disabled during this inspection.

The caller's development tools, lifecycle hooks, and host peer dependencies are not installed into the audit project. Pi supplies its own SDK; the host's vulnerabilities must be tracked separately. In particular, the development Pi 1.0.0 SDK currently pins a vulnerable `brace-expansion` through its shrinkwrap. This action does not claim that the host is vulnerability-free.

Pin consumers to a reviewed commit of this repository. The action uses only Node builtins and npm; no sibling source checkout is required.
