import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { GraphHopperEngine } from './engine/graphhopper.js';
import { SyntheticEngine } from './engine/synthetic.js';

const config = loadConfig();
const engine =
  config.engine === 'synthetic'
    ? new SyntheticEngine()
    : new GraphHopperEngine(config.graphhopperUrl);

const app = buildApp({ config, engine });

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
