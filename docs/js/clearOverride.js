// Compatibility wrapper kept for historical bundles that imported
// "clearOverride" without the leading underscore. It simply delegates to
// the underscore-prefixed shim so both paths stay in sync.
import './_clearOverride.js?v=1';
