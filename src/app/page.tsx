export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-700">
          HackAlem AI
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          Аким на 5 часов
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          Выберите пять городских инициатив, распределите бюджет и увидьте,
          как меняется качество жизни в районах Астаны.
        </p>
      </header>
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-sm text-slate-500">Бюджет</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">100</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Исходный Score</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">52.56</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Решения</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">0 / 5</p>
          </div>
        </div>
        <p className="mt-8 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Конструктор сценария подключается следующим шагом. Числа уже
          рассчитываются детерминированным симулятором в <code>src/lib/simulation</code>.
        </p>
      </section>
    </main>
  );
}
