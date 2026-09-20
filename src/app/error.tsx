'use client';
export default function ErrorPage({error,reset}:{error:Error;reset:()=>void}) {return <main className="mx-auto max-w-lg p-8"><h1 className="text-xl font-semibold">Your kitchen couldn’t load</h1><p role="alert" className="my-4">{error.message}</p><button className="rounded-lg bg-emerald-700 p-3 text-white" onClick={reset}>Try again</button></main>;}
