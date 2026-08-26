import {
  cleanupCoreLoopFixtures,
  coreLoopFixtureManifestPath,
  pendingCoreLoopFixturePrefixes,
} from '../../tests/e2e/helpers/coreLoopFixtures';

const pending = pendingCoreLoopFixturePrefixes();
if (pending.length === 0) {
  process.stdout.write(`No pending Sandbox core-loop fixture prefixes in ${coreLoopFixtureManifestPath}.\n`);
} else {
  cleanupCoreLoopFixtures(pending);
  process.stdout.write(`Recovered ${pending.length} exact Sandbox core-loop fixture prefix(es); zero-residue checks passed.\n`);
}
