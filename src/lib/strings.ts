// Finnish UI strings. The app is Finland-only (MML imagery), so there's one
// language — these constants are the single source of truth. Components AND
// tests import `t`, so wording can change here without breaking tests.
//
// Server (worker) responses stay English (the API contract); the UI shows the
// Finnish messages below instead of echoing raw server text.

export const t = {
  brand: "Arboretium",

  // shared
  loading: "Ladataan…",
  save: "Tallenna",
  saving: "Tallennetaan…",
  cancel: "Peruuta",
  delete: "Poista",
  edit: "Muokkaa",
  close: "Sulje",
  signOut: "Kirjaudu ulos",
  failedToLoad: "Lataus epäonnistui",

  // header / nav / menu
  navSignIn: "Kirjaudu sisään",
  navRegister: "Luo tili",
  menuMyProperties: "Omat kohteet",
  menuSettings: "Asetukset",
  menuAdmin: "Ylläpito",

  // home
  homeTagline: "Kartoita pihasi ja mökkisi kasvit ja puut.",
  homeOpen: "Avaa sovellus",

  // login
  loginTitle: "Kirjaudu sisään",
  email: "Sähköposti",
  password: "Salasana",
  loginSubmit: "Kirjaudu",
  loginSubmitting: "Kirjaudutaan…",
  loginNeedAccount: "Eikö sinulla ole tiliä?",
  loginFailed: "Väärä sähköposti tai salasana",

  // register
  registerTitle: "Luo tili",
  registerIntro:
    "Kysy sivuston salasana ylläpitäjältä, jos sinulla ei ole sitä.",
  passwordWithRule: "Salasana (vähintään 10 merkkiä)",
  sitePassword: "Sivuston salasana",
  registerSubmit: "Luo tili",
  registerSubmitting: "Luodaan tiliä…",
  registerHaveAccount: "Onko sinulla jo tili?",
  registerSignInLink: "Kirjaudu",
  registerFailed: "Rekisteröinti epäonnistui",

  // reset password
  resetTitle: "Aseta uusi salasana",
  resetNewPassword: "Uusi salasana (vähintään 10 merkkiä)",
  resetSubmit: "Vaihda salasana",
  resetSubmitting: "Vaihdetaan…",
  resetDoneTitle: "Salasana vaihdettu",
  resetDoneBody: "Valmis. Ohjataan kirjautumiseen…",
  resetFailed: "Salasanan vaihto epäonnistui",
  login: "kirjautumiseen",

  // settings
  settingsTitle: "Asetukset",
  settingsSignedInAs: "Kirjautunut käyttäjänä",
  settingsChangePassword: "Vaihda salasana",
  settingsCurrentPassword: "Nykyinen salasana",
  settingsNewPassword: "Uusi salasana (vähintään 10 merkkiä)",
  settingsUpdate: "Päivitä salasana",
  settingsUpdated: "Salasana päivitetty.",
  settingsSession: "Istunto",
  settingsChangeFailed: "Salasanan vaihto epäonnistui",

  // property picker
  propertiesTitle: "Valitse kohde",
  propertiesEmptyTitle: "Et ole vielä minkään kohteen jäsen.",
  propertiesEmptyBody: "Pyydä ylläpitäjää lisäämään sinut kohteeseen.",
  hexes: (n: number) => `${n} ruutua`,
  noCentre: "ei keskipistettä",

  // property tabs
  tabMap: "Kartta",
  tabPlants: "Kasvit",

  // property switcher
  switcherLabel: "Kohde",
  switcherNone: "Ei muita kohteita.",
  switcherPickAnother: "Valitse toinen kohde →",

  // property layout
  propertyLoading: "Ladataan kohdetta…",
  propertyLoadFailed: "Kohteen lataus epäonnistui",

  // map view
  hexesOff: "Ruudukko pois",
  hexesOn: "Ruudukko päällä",
  mapAddPlant: "Lisää kasvi kohteen keskelle",
  mapNoCentre:
    "Kohteella ei ole vielä keskipistettä — napauta ruutua kartalla.",
  mapPlants: (n: number) => `${n} kasvia`,
  mapLoadPlantsFailed: "Kasvien lataus epäonnistui",
  basemapStreet: "Kartta",
  basemapSatMml: "Ilmakuva (MML)",
  basemapSatEsri: "Ilmakuva (Esri)",
  basemapFellBack: "MML-avainta ei ole — käytetään Esri-ilmakuvaa.",

  // plants list
  plantsHeading: (name: string) => `${name} · kasvit`,
  plantsSummary: (count: number, species: number) =>
    `${count} kasvia · ${species} lajia`,
  plantsSearchPlaceholder:
    "Hae nimellä, latinalla, muistiinpanoilla tai lähteellä…",
  plantsEmpty:
    "Ei vielä kasveja tässä kohteessa. Avaa kartta ja napauta ruutua lisätäksesi kasvin.",
  colName: "Nimi",
  colType: "Tyyppi",
  colPlanted: "Istutettu",
  colUpdated: "Päivitetty",
  colActions: "Toiminnot",
  plantsNoMatch: (q: string) => `Ei hakua "${q}" vastaavia kasveja.`,
  showOnMap: "Näytä kartalla",

  // plant sheet
  plantAddTitle: "Lisää kasvi",
  plantEditTitle: "Muokkaa kasvia",
  plantTabInfo: "Tiedot",
  plantTabTimeline: "Aikajana",
  plantCommonName: "Yleisnimi",
  plantLatinName: "Latinankielinen nimi",
  plantType: "Tyyppi",
  plantPlanted: "Istutettu",
  plantSource: "Lähde",
  plantNotes: "Muistiinpanot",
  plantCell: "Ruutu",
  plantPosition: "Sijainti",
  plantCreated: "Luotu",
  plantUpdated: "Päivitetty",
  plantCommonNameField: "Yleisnimi *",
  plantTypePlaceholder: "esim. puu, pensas, perenna",
  plantPlantedField: "Istutettu (vapaa teksti tai VVVV-KK-PP)",
  plantSourcePlaceholder: "Taimisto, lahja, itsekylvänyt…",
  plantCommonNameRequired: "Yleisnimi on pakollinen",
  plantSaveFailed: "Tallennus epäonnistui",
  plantDeleteConfirm: (name: string) => `Poistetaanko "${name}"?`,
  plantDeleteFailed: "Poisto epäonnistui",
  plantCellLabel: "Ruutu:",

  // photo timeline (shared by plant + cell)
  photoAdd: "Lisää kuva",
  photoUploading: "Ladataan…",
  photoOldestFirst: "Vanhin ensin",
  photoNewestFirst: "Uusin ensin",
  photoNone: "Ei vielä kuvia.",
  photoUploadTime: "(latausaika)",
  photoCaption: "Kuvateksti",
  photoCaptionPrompt: "Kuvateksti",
  photoDeleteConfirm: "Poistetaanko tämä kuva? Tätä ei voi perua.",
  photoUploadFailed: "Lataus epäonnistui",
  photoCaptionFailed: "Päivitys epäonnistui",
  photoDeleteFailed: "Poisto epäonnistui",
  photoLoadFailed: "Kuvien lataus epäonnistui",

  // cell sheet
  cellTitle: "Tämä paikka",
  cellPlantsHere: (n: number) => `Kasvit täällä (${n})`,
  cellNoPlants: "Ei vielä kasveja tässä paikassa.",
  cellAddPlantHere: "+ Lisää kasvi tähän",
  cellNotesTitle: "Muistiinpanot paikasta",
  cellNotesPlaceholder: "esim. kivinen maaperä, varjoisa, märkä keväällä…",
  cellSaveNotes: "Tallenna muistiinpanot",
  cellPhotosTitle: (n: number) => `Kuvat paikasta (${n})`,
  cellAddPhotoHere: "+ Lisää kuva paikasta",
  cellDetailsTitle: "Ruudun tiedot",
  cellRes15: "Ruutu (taso 15)",
  cellParentRes: (res: number) => `Yläruutu taso ${res}`,
  cellCentre: "Keskipiste",
  cellSaveNotesFailed: "Tallennus epäonnistui",

  // offline
  offlineMessage: "Offline — näytetään viimeksi tallennetut tiedot",

  // admin (owner-only local tooling)
  adminTitle: "Ylläpito",
  adminSubtitle: "Kohteet · Käyttäjät · Varmuuskopiot",
  adminNavProperties: "Kohteet",
  adminNavUsers: "Käyttäjät",
  adminNavBackups: "Varmuuskopiot",
  adminNewProperty: "Uusi kohde",
  adminActive: (n: number) => `Aktiiviset (${n})`,
  adminArchived: (n: number) => `Arkistoidut (${n})`,
  adminNoActive: "Ei aktiivisia kohteita. Luo uusi aloittaaksesi.",
  adminNoArchived: "Ei arkistoituja kohteita.",
  adminArchiveAction: "Arkistoi",
  adminRestoreAction: "Palauta",
  adminColName: "Nimi",
  adminColHexes: "Ruutuja",
  adminColCentre: "Keskipiste",
  adminColUpdated: "Päivitetty",
  adminColActions: "Toiminnot",
  adminEdit: "Muokkaa",
  adminArchiveConfirm: (name: string) =>
    `Arkistoidaanko "${name}"? Jäsenet säilyttävät pääsyn, kunnes poistat heidät.`,
  adminArchiveFailed: "Arkistointi epäonnistui",
  adminRestoreFailed: "Palautus epäonnistui",
  adminLoadPropertiesFailed: "Kohteiden lataus epäonnistui",

  adminUsersTitle: "Käyttäjät",
  adminNoUsers: "Ei käyttäjiä vielä.",
  adminColEmail: "Sähköposti",
  adminColMemberships: "Jäsenyydet",
  adminColCreated: "Luotu",
  adminResetLink: "Palautuslinkki",
  adminLoadUsersFailed: "Käyttäjien lataus epäonnistui",
  adminDeleteUserConfirm: (name: string, email: string, n: number) =>
    `Poistetaanko ${name} (${email}) pysyvästi? Tämä poistaa ${n} jäsenyyttä sekä kaikki heidän kasvinsa ja kuvansa.`,
  adminDeleteUserFailed: "Poisto epäonnistui",
  adminResetLinkFailed: "Palautuslinkin luonti epäonnistui",
  adminResetBannerTitle: (name: string, email: string) =>
    `Palautuslinkki käyttäjälle ${name} (${email})`,
  adminResetBannerExpires: (when: string) =>
    `Näytetään vain kerran — kopioi se nyt. Vanhenee ${when}.`,
  adminDismiss: "Sulje",
  adminCopy: "Kopioi",
  adminCopied: "Kopioitu",
  adminNoIssuer: "Ei myöntäjäkäyttäjää — rekisteröi ensin käyttäjä.",

  adminBackupsTitle: "Varmuuskopiot",
  adminBackupsState: "Nykyinen tila (paikallinen D1)",
  adminStatUsers: "Käyttäjät",
  adminStatActive: "Kohteet (aktiiviset)",
  adminStatArchived: "Kohteet (arkistoidut)",
  adminStatPlants: "Kasvit",
  adminStatPhotos: "Kuvat",
  adminBackupsRun: "Aja varmuuskopio",
  adminLoadStatsFailed: "Tilastojen lataus epäonnistui",

  // admin property form + members
  adminFormEditTitle: (name: string | undefined) => `Muokkaa · ${name ?? ""}`,
  adminNameRequired: "Nimi on pakollinen",
  adminPickOwner: "Valitse omistaja",
  adminDrawBoundary: "Piirrä kohteen rajat ensin",
  adminIncludeHex: "Lisää vähintään yksi ruutu",
  adminFormSaveFailed: "Tallennus epäonnistui",
  adminFieldName: "Nimi",
  adminFieldOwner: "Omistaja",
  adminNamePlaceholder: "esim. Tampereen piha",
  adminNoUsersRegistered: "Ei rekisteröityjä käyttäjiä. Rekisteröi ensin yksi.",
  adminBoundaryLabel: "Rajat:",
  adminBoundaryDrawn: "piirretty",
  adminBoundaryNotDrawn: "ei vielä piirretty",
  adminHexesLabel: "Ruudut:",
  adminCentreLabel: "Keskipiste:",
  adminMembers: "Jäsenet",
  adminAdd: "Lisää",
  adminLoadMembersFailed: "Jäsenten lataus epäonnistui",
  adminAddMemberFailed: "Lisäys epäonnistui",
  adminRemoveMemberFailed: "Poisto epäonnistui",
  adminRemoveMemberConfirm: (name: string) =>
    `Poistetaanko ${name} tästä kohteesta?`,
  adminNoMembers: "Ei jäseniä vielä.",
  adminOwnerBadge: "omistaja",
  adminRemove: "Poista",
} as const;
