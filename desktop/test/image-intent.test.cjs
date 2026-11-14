'use strict';
const test=require('node:test');
test('shared image intent: natural requests, no greeting/capability false positives, bounded classifier',async()=>{await import('../../tests/image_intent_check.mjs');});
