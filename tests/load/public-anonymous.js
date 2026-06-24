import http from 'k6/http';
import { check, sleep } from 'k6';
import { publicBaseUrl, publicRoutes, publicThresholds, stageProfile } from './helpers/loadGuards.js';

const baseUrl = publicBaseUrl();
const routes = publicRoutes();

export const options = {
  stages: stageProfile(),
  thresholds: publicThresholds,
};

export default function publicAnonymousLoad() {
  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    const response = http.get(url, {
      tags: {
        route,
        scenario: 'public-anonymous',
      },
    });

    check(response, {
      'public route status is < 400': res => res.status < 400,
      'public route returned html': res => String(res.headers['Content-Type'] || '').includes('text/html'),
    });
  }

  sleep(Number(__ENV.LOAD_TEST_SLEEP_SECONDS || '1'));
}
