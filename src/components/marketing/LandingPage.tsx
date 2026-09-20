import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChefHat,
  Github,
  Heart,
  House,
  Leaf,
  LockKeyhole,
  ScanBarcode,
  ShoppingBasket,
  Sparkles,
  Users,
} from "lucide-react";
import { FaqAccordion } from "./FaqAccordion";
import { KitchenPreview } from "./KitchenPreview";
import styles from "./landing.module.css";

const repository = "https://github.com/gamerg21/sous-chef";
const setupGuide = `${repository}/blob/main/DEPLOYMENT.md`;
const features = [
  {
    icon: Leaf,
    title: "A pantry with a little perspective.",
    text: "Keep tabs on your fridge, freezer, and pantry. Track quantities and expiration dates so good ingredients don’t get forgotten.",
    detail: "Less guessing. Less going to waste.",
  },
  {
    icon: BookOpen,
    title: "Your recipes, all at home.",
    text: "Collect your favorites, edit them your way, and import or export your recipe collection. Keep the dishes you love close at hand.",
    detail: "A cookbook that grows with you.",
  },
  {
    icon: ShoppingBasket,
    title: "From “what’s missing?” to done.",
    text: "Preview ingredient shortages, build your shopping list, and put purchases back into your inventory when you get home.",
    detail: "One less thing to keep in your head.",
  },
];
const questions = [
  {
    question: "What do I need to run Sous Chef?",
    answer:
      "A server or computer with Docker and Docker Compose. Follow the setup guide, start the app, and create a local account in your browser. Your kitchen data lives in a persistent volume on that server.",
  },
  {
    question: "Is Sous Chef free and open source?",
    answer:
      "Yes. Sous Chef is licensed under AGPL-3.0. You can inspect the code, run your own instance, and contribute improvements. You provide the hardware or hosting; optional AI providers may charge for their services.",
  },
  {
    question: "Do I need a cloud account or an AI key?",
    answer:
      "No. Pantry, recipes, cooking, and shopping work with your local account. Community sharing is optional and needs a configured community service and separate account. AI recipe drafts are also optional and use your own provider key.",
  },
  {
    question: "Can I share a kitchen with my household?",
    answer:
      "Yes. Household membership and roles let you keep a kitchen together. You can also belong to more than one household and switch between kitchens.",
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes. Sous Chef works in your phone’s browser when you can reach your home server. Camera barcode scanning needs trusted HTTPS. There is no native mobile app or automatic remote access service.",
  },
];

export function LandingPage({
  demoEnabled = false,
}: {
  demoEnabled?: boolean;
}) {
  return (
    <div className={styles.landing}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Link
          href="/welcome"
          className={styles.brand}
          aria-label="Sous Chef home"
        >
          <span className={styles.brandMark}>
            <ChefHat size={25} strokeWidth={1.6} />
          </span>
          Sous Chef<span className={styles.brandPeriod}>.</span>
        </Link>
        <nav aria-label="Main navigation" className={styles.nav}>
          <a className={styles.sectionNav} href="#features">
            Features
          </a>
          <a className={styles.sectionNav} href="#your-kitchen">
            Why self-host?
          </a>
          <a
            href={repository}
            className={styles.github}
            aria-label="Sous Chef on GitHub"
          >
            <Github size={17} /> <span>GitHub</span>
          </a>
          <Link href="/inventory" className={styles.navCta}>
            Open kitchen <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <h1 id="hero-title">
            A little less{" "}
            <span className={styles.serif}>“what’s for dinner?”</span>
            <br />A little more{" "}
            <span className={styles.green}>let’s cook.</span>
          </h1>
          <p className={styles.heroDescription}>
            Meet your kitchen’s other half. Bring your pantry, recipes, and
            shopping list together — and make more of what you already have.
          </p>
          <div className={styles.heroActions}>
            <a href={setupGuide} className={styles.primaryButton}>
              Make yourself at home <ArrowRight size={17} />
            </a>
            <a
              href={demoEnabled ? "/demo" : "#kitchen-preview"}
              className={styles.secondaryButton}
            >
              {demoEnabled ? "Try a demo kitchen" : "Take a look inside"}{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <p className={styles.heroFootnote}>
            Free & open source <span>·</span> Self-hosted <span>·</span> Yours
            to keep
          </p>
          <div className={styles.previewWrap}>
            <div className={styles.marginNote}>
              a calmer kind of kitchen <ArrowDown size={26} strokeWidth={1} />
            </div>
            <KitchenPreview />
          </div>
        </section>
        <div className={styles.valuesStrip}>
          <span>
            <House size={19} /> At home on your server
          </span>
          <span>
            <Users size={19} /> Made for your household
          </span>
          <span>
            <LockKeyhole size={18} /> Your private kitchen stays local
          </span>
        </div>
        <section
          id="features"
          className={styles.features}
          aria-labelledby="features-title"
        >
          <div className={styles.sectionHeading}>

            <h2 id="features-title">
              Everything has its place.
              <br />
              Even the dinner question.
            </h2>
            <p>Less kitchen admin. More time for the good part.</p>
          </div>
          <div className={styles.featureGrid}>
            {features.map(({ icon: Icon, title, text, detail }, index) => (
              <article className={styles.feature} key={title}>
                <div className={styles.featureTop}>
                  <span className={styles.featureIcon}>
                    <Icon size={25} strokeWidth={1.5} />
                  </span>
                  <span>0{index + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className={styles.featureDetail}>{detail}</span>
              </article>
            ))}
          </div>
          <div className={styles.smallFeatures}>
            <div>
              <ScanBarcode size={21} />
              <span>
                <strong>Scan. Add. Put away.</strong>Barcode lookup with Open
                Food Facts.
              </span>
            </div>
            <div>
              <ChefHat size={21} />
              <span>
                <strong>Cook with confidence.</strong>Unit-aware ingredient
                deductions.
              </span>
            </div>
            <div>
              <Sparkles size={21} />
              <span>
                <strong>A fresh idea, if you like.</strong>Optional AI drafts
                with your own key.
              </span>
            </div>
          </div>
        </section>
        <section
          id="your-kitchen"
          className={styles.ownership}
          aria-labelledby="ownership-title"
        >
          <div>

            <h2 id="ownership-title">
              Some things are
              <br />
              better kept <span className={styles.serif}>at home.</span>
            </h2>
            <p>
              Your family recipes. Your weekly staples. That very specific way
              you organize the freezer. Give them a home on your own server.
            </p>
            <a href={setupGuide} className={styles.textLink}>
              Set up your own kitchen <ArrowRight size={17} />
            </a>
          </div>
          <div className={styles.ownershipCard}>
            <span className={styles.ownershipHouse}>
              <House size={35} strokeWidth={1.3} />
            </span>
            <h3>A place of your own.</h3>
            <ul>
              <li>
                <Check size={17} /> Private kitchen data stays on your server
              </li>
              <li>
                <Check size={17} /> No cloud account needed for the essentials
              </li>
              <li>
                <Check size={17} /> Export recipes and keep your own backups
              </li>
              <li>
                <Check size={17} /> Share with the community only if you choose
              </li>
            </ul>
            <span className={styles.ownershipSignature}>
              <LockKeyhole size={14} /> Self-hosted, by design.
            </span>
          </div>
        </section>
        <section className={styles.community} aria-labelledby="community-title">
          <span className={styles.featureIcon}>
            <Users size={27} strokeWidth={1.5} />
          </span>
          <div>

            <h2 id="community-title">
              Your kitchen is personal.
              <br />
              Inspiration can be shared.
            </h2>
            <p>
              Connect an optional recipe community to discover something new,
              bring home a recipe, or share a favorite of your own. Your pantry
              stays yours.
            </p>
            <Link href="/explore" className={styles.textLink}>
              Explore community recipes <ArrowRight size={17} />
            </Link>
          </div>
        </section>
        <section
          id="open-source"
          className={styles.openSource}
          aria-labelledby="source-title"
        >
          <div>
            <span className={styles.sourceIcon}>
              <Github size={31} strokeWidth={1.5} />
            </span>

            <h2 id="source-title">
              Open source.
              <br />
              <span className={styles.serif}>Room at the table.</span>
            </h2>
            <p>
              Good tools get better when people make them their own. Read the
              code, report a bug, suggest an idea, or help build the next little
              improvement.
            </p>
            <a href={repository} className={styles.lightButton}>
              <Github size={17} /> Find us on GitHub <ArrowRight size={17} />
            </a>
          </div>
          <div className={styles.startCard}>

            <h3>
              A server. Docker.
              <br />
              An appetite.
            </h3>
            <ol>
              <li>
                <span>01</span> Get the code from GitHub
              </li>
              <li>
                <span>02</span> Follow the Docker setup guide
              </li>
              <li>
                <span>03</span> Open your kitchen & make it yours
              </li>
            </ol>
            <a href={setupGuide}>
              Read the setup guide <ArrowRight size={16} />
            </a>
            <small>AGPL-3.0 licensed · No required paid services</small>
          </div>
        </section>
        <section className={styles.faq} aria-labelledby="faq-title">
          <div>

            <h2 id="faq-title">
              A few good{" "}
              <br />
              questions.
            </h2>
            <p>Getting comfortable should be simple.</p>
          </div>
          <FaqAccordion questions={questions} />
        </section>
        <section className={styles.finalCta}>
          <Heart size={27} strokeWidth={1.3} />
          <h2>A happier kitchen starts here.</h2>
          <p>Make a little room for Sous Chef.</p>
          <a href={setupGuide} className={styles.primaryButton}>
            Let’s get cooking <ArrowRight size={17} />
          </a>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/welcome" className={styles.brand}>
          <ChefHat size={23} strokeWidth={1.6} /> Sous Chef
          <span className={styles.brandPeriod}>.</span>
        </Link>
        <span>A little help. A lot of home.</span>
        <nav aria-label="Footer navigation">
          <a href={setupGuide}>Documentation</a>
          <a href={`${repository}/blob/main/LICENSE`}>AGPL-3.0</a>
          <a href={repository}>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </footer>
    </div>
  );
}
