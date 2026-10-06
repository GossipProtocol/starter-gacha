import LoadedInMachine from './components/LoadedInMachine';
import MachineConsole from './components/MachineConsole';

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid items-start gap-6 md:grid-cols-5">
        {/* Hero — top left */}
        <section className="md:col-span-3 md:col-start-1 md:row-start-1">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <h1 id="hero-logo" className="text-5xl font-bold uppercase leading-[0.84] tracking-tighter sm:text-6xl lg:text-7xl">
              Thrifting<br />Machine
            </h1>
            <span className="mb-2 rotate-3 rounded-lg border-[3px] border-ink bg-lime px-3 py-1.5 text-center text-sm font-bold uppercase leading-tight shadow-hard-sm">
              Vintage tee<br />dispenser
            </span>
          </div>
          <p className="mt-4 max-w-xl text-lg font-medium leading-snug">
            A gacha vending machine for <span className="bg-pink px-1">real vintage tees</span>. We own every
            piece. Pull the machine, reveal what you got, then <span className="bg-lime px-1">ship it</span> or{' '}
            <span className="bg-lime px-1">sell it back</span> for credit.
          </p>
        </section>

        {/* The machine — top right, sticky, spans both rows */}
        <div id="machine" className="scroll-mt-24 md:col-span-2 md:col-start-4 md:row-start-1 md:row-span-2 md:self-start md:sticky md:top-24">
          <MachineConsole />
        </div>

        {/* Loot — under the hero */}
        <div className="md:col-span-3 md:col-start-1 md:row-start-2">
          <LoadedInMachine />
        </div>
      </div>
    </div>
  );
}
