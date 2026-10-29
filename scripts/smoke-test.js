#!/usr/bin/env node

/**
 * Live Smoke Test Suite for Tailvar Claims Backend
 *
 * Runs non-destructive end-to-end integration verification against any live target URL
 * (e.g. Render, staging, or local instance) using Node 18+ built-in fetch.
 *
 * Usage:
 *   npm run smoke -- <BASE_URL>
 *   node scripts/smoke-test.js http://localhost:5000
 *   node scripts/smoke-test.js https://tailvar-claims-backend.onrender.com
 */

const assert = require('assert');

// 1. Resolve and normalize target base URL
const args = process.argv.slice(2);
const rawUrl = args.find((arg) => !arg.startsWith('-') && (arg.startsWith('http://') || arg.startsWith('https://') || arg.includes(':')));

if (!rawUrl) {
  console.error('\n[Smoke Test Error] Target base URL is required.');
  console.error('Usage: npm run smoke -- <BASE_URL>');
  console.error('Example: npm run smoke -- https://tailvar-claims-backend.onrender.com\n');
  process.exit(1);
}

const baseUrl = rawUrl.replace(/\/+$/, '');

// 2. Metrics & Reporter
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

const runCheck = async (name, testFn) => {
  totalChecks++;
  process.stdout.write(`  [TEST ${String(totalChecks).padStart(2, '0')}] ${name} ... `);
  try {
    await testFn();
    passedChecks++;
    console.log('PASS');
  } catch (err) {
    failedChecks++;
    console.log('FAIL');
    console.error(`         -> ${err.message}`);
  }
};

// HTTP helper
const request = async (path, options = {}) => {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const fetchOptions = {
    method: options.method || 'GET',
    headers
  };

  if (options.body !== undefined) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await res.text();
      data = text ? { message: text } : null;
    } catch {
      data = null;
    }
  }

  return { status: res.status, ok: res.ok, data };
};

const runSmokeTests = async () => {
  console.log(`\n======================================================`);
  console.log(` Tailvar Claims Backend — Live Smoke Test Suite`);
  console.log(` Target URL: ${baseUrl}`);
  console.log(` Timestamp:  ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  let customer1Token, customer1Id;
  let customer2Token, customer2Id;
  let adminToken;
  let freshPolicy;
  let claim1Id;
  let claim2Id;

  // 1. Health check & DB connection
  await runCheck('GET /api/health returns 200 with { status: "ok" } and DB connected', async () => {
    const res = await request('/api/health');
    assert.strictEqual(res.status, 200, `Expected 200 but got ${res.status}`);
    assert.strictEqual(res.data?.status, 'ok', `Expected status "ok" but got ${JSON.stringify(res.data)}`);
  });

  // 2. Authentication: 3 demo accounts login & invalid password rejection
  await runCheck('POST /api/auth/login works for customer1, customer2, and admin', async () => {
    const c1 = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'customer1', password: 'Customer1@Demo26' }
    });
    assert.strictEqual(c1.status, 200, `customer1 login failed: ${JSON.stringify(c1.data)}`);
    assert.ok(c1.data.token, 'customer1 token missing');
    customer1Token = c1.data.token;
    customer1Id = c1.data.user?.id || c1.data.id;

    const c2 = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'customer2', password: 'Customer2@Demo26' }
    });
    assert.strictEqual(c2.status, 200, `customer2 login failed: ${JSON.stringify(c2.data)}`);
    assert.ok(c2.data.token, 'customer2 token missing');
    customer2Token = c2.data.token;
    customer2Id = c2.data.user?.id || c2.data.id;

    const adm = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Admin@Demo26' }
    });
    assert.strictEqual(adm.status, 200, `admin login failed: ${JSON.stringify(adm.data)}`);
    assert.ok(adm.data.token, 'admin token missing');
    adminToken = adm.data.token;
  });

  await runCheck('POST /api/auth/login with invalid password returns 401 UNAUTHORIZED', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'customer1', password: 'WrongPassword@123' }
    });
    assert.strictEqual(res.status, 401, `Expected 401 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'UNAUTHORIZED');
  });

  // 3. Unauthenticated route access
  await runCheck('Unauthenticated GET /api/policies returns 401 UNAUTHORIZED', async () => {
    const res = await request('/api/policies');
    assert.strictEqual(res.status, 401, `Expected 401 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'UNAUTHORIZED');
  });

  // 4. Role restrictions: Customer cannot call admin endpoints
  await runCheck('Customer cannot POST /api/policies (returns 403 FORBIDDEN)', async () => {
    const res = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { customerId: customer1Id, startDate: '2026-01-01', endDate: '2026-12-31', sumInsured: 500000 }
    });
    assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'FORBIDDEN');
  });

  await runCheck('Customer cannot GET /api/customers (returns 403 FORBIDDEN)', async () => {
    const res = await request('/api/customers', {
      headers: { Authorization: `Bearer ${customer1Token}` }
    });
    assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'FORBIDDEN');
  });

  await runCheck('Customer cannot PATCH /api/claims/:id/decision (returns 403 FORBIDDEN)', async () => {
    const res = await request('/api/claims/CLM-0001/decision', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { decision: 'APPROVED' }
    });
    assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'FORBIDDEN');
  });

  // 5. Role restrictions: Admin cannot submit claims
  await runCheck('Admin cannot POST /api/claims (returns 403 FORBIDDEN)', async () => {
    const res = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { policyId: 'POL-0001', incidentDate: '2026-05-01', amount: 10000 }
    });
    assert.strictEqual(res.status, 403, `Expected 403 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'FORBIDDEN');
  });

  // 6. Admin creates a fresh policy for customer1; customer1 sees it, customer2 does NOT
  await runCheck('Admin creates fresh policy for customer1 (SI ₹10,00,000); customer1 sees it, customer2 gets 404', async () => {
    const createRes = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerId: customer1Id,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: 1000000
      }
    });
    assert.strictEqual(createRes.status, 201, `Policy creation failed: ${JSON.stringify(createRes.data)}`);
    freshPolicy = createRes.data;
    assert.ok(freshPolicy.policyId, 'Created policy missing policyId');
    assert.strictEqual(freshPolicy.sumInsured, 1000000);

    // Customer 1 sees it in list
    const c1List = await request('/api/policies', {
      headers: { Authorization: `Bearer ${customer1Token}` }
    });
    assert.strictEqual(c1List.status, 200);
    const hasPolicy = c1List.data.some((p) => p.policyId === freshPolicy.policyId);
    assert.ok(hasPolicy, 'customer1 policy listing does not contain fresh policy');

    // Customer 2 does NOT see it in list
    const c2List = await request('/api/policies', {
      headers: { Authorization: `Bearer ${customer2Token}` }
    });
    assert.strictEqual(c2List.status, 200);
    const c2HasPolicy = c2List.data.some((p) => p.policyId === freshPolicy.policyId);
    assert.strictEqual(c2HasPolicy, false, 'customer2 should not see customer1 policy');

    // Customer 2 gets 404 attempting to fetch it directly
    const c2Fetch = await request(`/api/policies/${freshPolicy.policyId}`, {
      headers: { Authorization: `Bearer ${customer2Token}` }
    });
    assert.strictEqual(c2Fetch.status, 404, `Expected 404 but got ${c2Fetch.status}`);
  });

  // 7. Admin policy creation input validation
  await runCheck('Policy with end date before start date is rejected (400 INVALID_DATE_RANGE)', async () => {
    const res = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerId: customer1Id,
        startDate: '2026-12-01',
        endDate: '2026-01-01',
        sumInsured: 500000
      }
    });
    assert.strictEqual(res.status, 400, `Expected 400 but got ${res.status}`);
    assert.strictEqual(res.data?.error?.code, 'INVALID_DATE_RANGE');
  });

  await runCheck('Policy with SI 0 or negative SI is rejected (400 VALIDATION_ERROR)', async () => {
    const zeroRes = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerId: customer1Id,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: 0
      }
    });
    assert.strictEqual(zeroRes.status, 400, `Expected 400 for SI 0 but got ${zeroRes.status}`);

    const negRes = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerId: customer1Id,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: -1000
      }
    });
    assert.strictEqual(negRes.status, 400, `Expected 400 for negative SI but got ${negRes.status}`);
  });

  // 8. Spec Example End-to-End Workflow on fresh policy
  await runCheck('Spec Example: 6L submitted (rem 4L); 5L rejected (422); admin rejects 6L; rem returns 10L; 5L accepted; admin approves; 409 on re-decide', async () => {
    // a. Submit 6,00,000 on freshPolicy
    const claim1Res = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: {
        policyId: freshPolicy.policyId,
        incidentDate: '2026-05-15',
        amount: 600000
      }
    });
    assert.strictEqual(claim1Res.status, 201, `Failed to submit 6L claim: ${JSON.stringify(claim1Res.data)}`);
    assert.strictEqual(claim1Res.data.policy?.remainingClaimableSi, 400000);
    claim1Id = claim1Res.data.claim?.claimId || claim1Res.data.claim?.id;

    // b. Try submitting 5,00,000 (exceeds remaining 4,00,000) -> 422
    const claimFailRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: {
        policyId: freshPolicy.policyId,
        incidentDate: '2026-06-01',
        amount: 500000
      }
    });
    assert.strictEqual(claimFailRes.status, 422, `Expected 422 but got ${claimFailRes.status}`);
    assert.strictEqual(claimFailRes.data?.error?.code, 'AMOUNT_EXCEEDS_REMAINING_SI');

    // c. Admin rejects the 6,00,000 claim -> remaining returns to 10,00,000
    const rejectRes = await request(`/api/claims/${claim1Id}/decision`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { decision: 'REJECTED' }
    });
    assert.strictEqual(rejectRes.status, 200, `Failed to reject claim: ${JSON.stringify(rejectRes.data)}`);
    assert.strictEqual(rejectRes.data.policy?.remainingClaimableSi, 1000000);
    assert.strictEqual(rejectRes.data.claim?.status, 'REJECTED');

    // d. Customer submits the 5,00,000 claim now -> accepted (201)
    const claim2Res = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: {
        policyId: freshPolicy.policyId,
        incidentDate: '2026-06-01',
        amount: 500000
      }
    });
    assert.strictEqual(claim2Res.status, 201, `Failed to submit 5L claim after release: ${JSON.stringify(claim2Res.data)}`);
    assert.strictEqual(claim2Res.data.policy?.remainingClaimableSi, 500000);
    claim2Id = claim2Res.data.claim?.claimId || claim2Res.data.claim?.id;

    // e. Admin approves the 5,00,000 claim -> remaining stays 5,00,000
    const approveRes = await request(`/api/claims/${claim2Id}/decision`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { decision: 'APPROVED' }
    });
    assert.strictEqual(approveRes.status, 200, `Failed to approve claim: ${JSON.stringify(approveRes.data)}`);
    assert.strictEqual(approveRes.data.policy?.remainingClaimableSi, 500000);
    assert.strictEqual(approveRes.data.claim?.status, 'APPROVED');

    // f. Admin tries to decide claim2Id again -> returns 409 CLAIM_ALREADY_DECIDED
    const reDecideRes = await request(`/api/claims/${claim2Id}/decision`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { decision: 'REJECTED' }
    });
    assert.strictEqual(reDecideRes.status, 409, `Expected 409 but got ${reDecideRes.status}`);
    assert.strictEqual(reDecideRes.data?.error?.code, 'CLAIM_ALREADY_DECIDED');
  });

  // 9. Incident date boundaries
  await runCheck('Incident date outside policy range rejected; incident date on start and end dates accepted', async () => {
    // Outside before start (2025-12-31)
    const beforeRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { policyId: freshPolicy.policyId, incidentDate: '2025-12-31', amount: 100 }
    });
    assert.strictEqual(beforeRes.status, 422);
    assert.strictEqual(beforeRes.data?.error?.code, 'INCIDENT_DATE_OUT_OF_RANGE');

    // Outside after end (2027-01-01)
    const afterRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { policyId: freshPolicy.policyId, incidentDate: '2027-01-01', amount: 100 }
    });
    assert.strictEqual(afterRes.status, 422);
    assert.strictEqual(afterRes.data?.error?.code, 'INCIDENT_DATE_OUT_OF_RANGE');

    // On start date (2026-01-01)
    const onStartRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { policyId: freshPolicy.policyId, incidentDate: '2026-01-01', amount: 100 }
    });
    assert.strictEqual(onStartRes.status, 201, `Claim on start date rejected: ${JSON.stringify(onStartRes.data)}`);

    // On end date (2026-12-31)
    const onEndRes = await request('/api/claims', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customer1Token}` },
      body: { policyId: freshPolicy.policyId, incidentDate: '2026-12-31', amount: 100 }
    });
    assert.strictEqual(onEndRes.status, 201, `Claim on end date rejected: ${JSON.stringify(onEndRes.data)}`);
  });

  // 10. Claim isolation: customer2 cannot see customer1 claims
  await runCheck('Customer2 cannot see or fetch customer1 claims (404 on direct fetch)', async () => {
    const c2Claims = await request('/api/claims', {
      headers: { Authorization: `Bearer ${customer2Token}` }
    });
    assert.strictEqual(c2Claims.status, 200);
    const leaked = c2Claims.data.some((c) => c.claimId === claim1Id || c.claimId === claim2Id);
    assert.strictEqual(leaked, false, 'Customer 1 claims leaked into Customer 2 listing');

    const directFetch = await request(`/api/claims/${claim2Id}`, {
      headers: { Authorization: `Bearer ${customer2Token}` }
    });
    assert.strictEqual(directFetch.status, 404, `Expected 404 but got ${directFetch.status}`);
  });

  // 11. Concurrency race-condition verification: 5 simultaneous claims of 4L on 10L SI -> exactly 2 succeed
  await runCheck('5 simultaneous claims of ₹4L on fresh ₹10L policy: exactly 2 succeed, exactly 3 rejected', async () => {
    // Create dedicated concurrency policy for customer1
    const pRes = await request('/api/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        customerId: customer1Id,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        sumInsured: 1000000
      }
    });
    assert.strictEqual(pRes.status, 201, 'Concurrency policy creation failed');
    const concPolicyId = pRes.data.policyId;

    // Fire 5 simultaneous requests concurrently
    const promises = Array.from({ length: 5 }, () =>
      request('/api/claims', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customer1Token}` },
        body: {
          policyId: concPolicyId,
          incidentDate: '2026-07-01',
          amount: 400000
        }
      })
    );

    const responses = await Promise.all(promises);

    const successes = responses.filter((r) => r.status === 201);
    const rejected = responses.filter((r) => r.status === 422 && r.data?.error?.code === 'AMOUNT_EXCEEDS_REMAINING_SI');

    assert.strictEqual(
      successes.length,
      2,
      `Expected exactly 2 successful claims but got ${successes.length}. Statuses: ${responses.map((r) => r.status).join(', ')}`
    );
    assert.strictEqual(
      rejected.length,
      3,
      `Expected exactly 3 rejected claims (422) but got ${rejected.length}. Statuses: ${responses.map((r) => r.status).join(', ')}`
    );
  });

  // 12. Final summary and live data warning
  console.log(`\n======================================================`);
  console.log(` Smoke Test Summary:`);
  console.log(` Total Checks:  ${totalChecks}`);
  console.log(` Passed:        ${passedChecks}`);
  console.log(` Failed:        ${failedChecks}`);
  console.log(` Status:        ${failedChecks === 0 ? 'ALL CHECKS PASSED ✅' : 'SOME CHECKS FAILED ❌'}`);
  console.log(`------------------------------------------------------`);
  console.log(` ⚠️  WARNING: This smoke test executed live operations and created`);
  console.log(`     policies and claims in the target database.`);
  console.log(`     To reset to baseline demo data, run:`);
  console.log(`     npm run reset-demo -- --yes`);
  console.log(`======================================================\n`);

  if (failedChecks > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runSmokeTests().catch((err) => {
  console.error(`\n[Smoke Test Fatal Error] ${err.stack || err.message}`);
  process.exit(1);
});

