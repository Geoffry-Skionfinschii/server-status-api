

import express from 'express';
import expressws from 'express-ws';
const app = expressws(express()).app;
import cors from 'cors';
import Routes from './routes';

const port = 3000;
app.use(express.json());

app.use(cors());

app.use(Routes);




app.listen(port, async () => {
    console.log(`Express server on ${port}`);
})