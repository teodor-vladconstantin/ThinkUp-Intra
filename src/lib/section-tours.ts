// Per-page onboarding tours: each starts the first time a person opens that page (after the
// main tour), and "Ghid pagină" in the header replays it. A step points at a data-tour
// attribute of the page; a step whose element is missing for this role is skipped.
// Change a tour's content in a way people should see again -> rename its key.
export type TourStep = { selector?: string; title: string; text: string };
export type SectionTour = { key: string; match: (path: string) => boolean; steps: TourStep[] };

const at = (name: string) => `[data-tour="${name}"]`;
const is = (...paths: string[]) => (p: string) => paths.includes(p);

export const SECTION_TOURS: SectionTour[] = [
  {
    key: "dashboard",
    match: is("/dashboard"),
    steps: [
      { selector: "h1", title: "Pagina ta de start", text: "Aici vezi pe scurt ce ai de făcut. Te întorci la ea oricând cu „Acasă”, din meniu." },
      { selector: at("dash-tasks"), title: "Sarcinile mele", text: "Apasă pe o sarcină ca s-o deschizi. „Toate” te duce la lista completă, cu filtre." },
    ],
  },
  {
    key: "tasks",
    match: is("/tasks"),
    steps: [
      { selector: at("tasks-filters"), title: "Filtre", text: "Schimbi între sarcinile tale, ale departamentului sau doar cele întârziate. Cele întârziate apar și în banda roșie de sus." },
      { selector: at("new-task"), title: "Sarcină nouă", text: "Apasă aici ca să creezi o sarcină: titlu, responsabil, termen și prioritate. Pentru a edita una existentă, o deschizi din listă și apeși „Salvează”." },
    ],
  },
  {
    key: "board",
    match: is("/board"),
    steps: [
      { selector: at("board-views"), title: "Departament și vedere", text: "Alegi departamentul (dacă ai acces la mai multe) și treci între vederea Kanban și Listă." },
      { selector: at("board-columns"), title: "Coloanele de stare", text: "Fiecare sarcină stă în coloana stării ei. Deschide o sarcină ca să-i schimbi starea." },
    ],
  },
  {
    key: "leadership",
    match: is("/leadership"),
    steps: [{ selector: "h1", title: "Sarcini întârziate", text: "Lista sarcinilor care au depășit termenul, din toate departamentele. O deschizi ca să vezi cine răspunde de ea și ce a rămas." }],
  },
  {
    key: "meetings",
    match: is("/meetings"),
    steps: [
      { selector: at("new-meeting"), title: "Ședință nouă", text: "Completezi titlul, data, participanții, minutele, deciziile (una pe rând) și sarcinile de urmat. Deciziile ajung în Registrul deciziilor." },
      { selector: "h1", title: "Lista ședințelor", text: "Apasă pe o ședință ca s-o citești sau s-o editezi." },
    ],
  },
  {
    key: "decisions",
    match: is("/decisions"),
    steps: [
      { selector: at("decisions-search"), title: "Caută o decizie", text: "Scrie un cuvânt și apasă „Caută”. Fiecare decizie trimite la ședința în care a fost luată." },
    ],
  },
  {
    key: "documents",
    match: is("/documents"),
    steps: [
      { selector: at("new-document"), title: "Adaugă un document", text: "Completezi titlul, linkul (de exemplu Google Drive) și cui îi e vizibil. Apoi apare în lista de mai jos." },
      { selector: "h1", title: "Lista documentelor", text: "Deschizi un document din listă. „Arhivează” îl scoate din listă fără să-l șteargă." },
    ],
  },
  {
    key: "announcements",
    match: is("/announcements"),
    steps: [
      { selector: at("new-announcement"), title: "Anunț nou", text: "Scrii titlul și textul, poți marca anunțul ca important și poți alege când expiră. „Arhivează” îl ascunde când nu mai e valabil." },
      { selector: "h1", title: "Anunțurile curente", text: "Aici le citești pe toate, cele mai noi primele." },
    ],
  },
  {
    key: "pn",
    match: is("/pn"),
    steps: [
      { selector: at("pn-tabs"), title: "Secțiunile Programului Național", text: "Hartă, Licee, Ambasadori și Zone. Treci între ele din aceste butoane." },
      { selector: ".leaflet-container", title: "Harta județelor", text: "Județele sunt colorate după zona lor; cele gri n-au zonă încă. Liceele din fiecare județ apar pe hartă." },
    ],
  },
  {
    key: "pn-schools",
    match: (p) => p === "/pn/schools",
    steps: [
      { selector: at("schools-search"), title: "Filtrează liceele", text: "Alegi județul sau scrii un nume și apeși „Filtrează”." },
      { selector: at("schools-list"), title: "Lista liceelor", text: "Deschide un liceu ca să vezi contactul, jurnalul de contact și ambasadorii. Cine face parte din PN poate invita acolo ambasadori pe platformă." },
    ],
  },
  {
    key: "pn-ambassadors",
    match: (p) => p === "/pn/ambassadors",
    steps: [{ selector: "h1", title: "Ambasadorii", text: "Lista tuturor ambasadorilor, pe licee. Contul de platformă se leagă sau se invită din pagina liceului." }],
  },
  {
    key: "pn-zones",
    match: (p) => p === "/pn/zones",
    steps: [
      { selector: at("new-zone"), title: "Zonă nouă", text: "Dai un nume și o culoare, apoi apeși „Adaugă zona”. Județele fără zonă rămân gri pe hartă." },
      { selector: at("zones-list"), title: "Zonele existente", text: "Poți redenumi o zonă sau schimba culoarea, apoi apeși „Salvează”." },
    ],
  },
  {
    key: "invitations",
    match: is("/admin/invitations"),
    steps: [
      { selector: at("invite-card"), title: "Invită o persoană", text: "Scrii emailul, alegi rolul și departamentul și trimiți invitația. Fără invitație nimeni nu poate intra în platformă." },
      { selector: at("invites-sent"), title: "Invitații trimise", text: "Vezi cine n-a intrat încă. „Revocă” anulează o invitație în așteptare." },
    ],
  },
  {
    key: "users",
    match: is("/admin/users"),
    steps: [{ selector: at("users-list"), title: "Utilizatorii", text: "Rolul și departamentul fiecăruia. Un cont dezactivat pierde imediat accesul, iar sarcinile lui rămân nealocate." }],
  },
  {
    key: "platform-projects",
    match: is("/platform/projects"),
    steps: [
      { selector: at("project-tabs"), title: "Toate, ale mele, arhivate", text: "Filtrezi lista proiectelor. „Ale mele” le arată doar pe cele din echipa ta." },
      { selector: at("new-project"), title: "Proiect nou", text: "Dai un nume și o descriere și apeși „Creează proiectul”. Te duce direct în pagina lui." },
    ],
  },
  {
    key: "project",
    match: (p) => /^\/platform\/projects\/[0-9a-f-]{36}$/.test(p),
    steps: [
      { selector: at("project-settings"), title: "Setări: se salvează singure", text: "Numele, descrierea, challenge-ul și bifa de feedback se salvează singure după o secundă și jumătate. Butonul „Salvează” le salvează pe loc." },
      { selector: at("project-goals"), title: "Obiective", text: "Adaugi obiective cu termen și îți marchezi progresul. Fiecare obiectiv are propria bară." },
      { selector: at("project-summary"), title: "Rezumat PDF", text: "Ambasadorii din echipă încarcă aici un PDF cu rezumatul. Mentorii îl pot citi." },
      { selector: at("project-gallery"), title: "Galerie", text: "„Adaugă poză” se salvează imediat. „Copertă” alege poza care apare în capul paginii." },
      { selector: at("project-team"), title: "Echipa", text: "Adaugi sau scoți colegi din echipă. Doar membrii pot modifica proiectul." },
      { selector: at("project-reviews"), title: "Feedback de la colegi", text: "Colegii ambasadori lasă o notă de 1–5 stele și un comentariu. Mentorii dau feedback separat." },
    ],
  },
  {
    key: "challenges",
    match: is("/platform/challenges"),
    steps: [
      { selector: at("new-challenge"), title: "Challenge nou", text: "Doar mentorii creează challenge-uri. Proiectele își aleg challenge-ul din Setări, iar mentorii le notează pe criterii." },
      { selector: "h1", title: "Challenge-urile active", text: "„Vezi arhivate” arată challenge-urile încheiate." },
    ],
  },
  {
    key: "open-school",
    match: is("/platform/open-school"),
    steps: [
      { selector: at("os-search"), title: "Caută în bibliotecă", text: "Scrii un cuvânt și apeși „Caută”; sortezi după populare sau favorite." },
      { selector: at("os-add"), title: "Adaugă în bibliotecă", text: "Mentorii încarcă aici fișiere pentru toți ambasadorii." },
    ],
  },
  {
    key: "person",
    match: (p) => p === "/platform/me" || p.startsWith("/platform/people/"),
    steps: [
      { selector: at("person-projects"), title: "Proiectele", text: "Proiectele în care ești membru. Apasă pe unul ca să-l deschizi." },
      { selector: at("person-goals"), title: "Obiective personale", text: "Îți setezi obiective și le urmărești progresul. Se salvează cu butonul „Adaugă obiectiv”." },
    ],
  },
  {
    key: "gallery",
    match: is("/platform/gallery"),
    steps: [{ selector: at("gallery-search"), title: "Caută în galerie", text: "Filtrezi pozele din toate proiectele și deschizi proiectul din care vin." }],
  },
];

export const findSection = (path: string) => SECTION_TOURS.find((s) => s.match(path));
