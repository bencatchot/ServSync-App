import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'review.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:4179'},projects:[
  {name:'desktop',use:{...devices['Desktop Chrome']}},
  {name:'phone',use:{...devices['iPhone 13'],viewport:{width:375,height:812}}}
]});
