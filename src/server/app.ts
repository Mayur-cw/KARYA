import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';
export function createApp() {
 const config=getConfig();const app=express();app.disable('x-powered-by');
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"]}}}));
 app.use(cors({origin:(origin,cb)=>cb(null,!origin || config.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).includes(origin))}));
 app.use(rateLimit({windowMs:15*60_000,limit:100,standardHeaders:'draft-8',legacyHeaders:false}));
 app.use(express.json({limit:'64kb'}));
 app.get('/healthz',(_req,res)=>res.status(200).json({status:'ok'}));
 // App endpoints and authentication are created from contracts by T-03 and entity tasks.
 const dirname=path.dirname(fileURLToPath(import.meta.url));const staticDir=path.resolve(dirname,'../../dist/client');
 app.use(express.static(staticDir,{maxAge:'1h'}));
 app.get(/^\/(?!api\/).*/,(_req,res)=>res.sendFile(path.join(staticDir,'index.html')));
 return app;
}
