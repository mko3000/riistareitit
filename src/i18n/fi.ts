// RII-7: every user-visible string in the app, in Finnish. See
// docs/SPEC.md §7. Strings with values in them are functions. The English
// toggle (RII-14) adds an en.ts with the same shape (`Messages`).

export const fi = {
  common: {
    appName: 'Riistareitit',
    serverUnreachable: 'Palvelimeen ei saatu yhteyttä.',
    genericError: 'Jokin meni vikaan. Yritä uudelleen.',
    fixErrorsBelow: 'Korjaa alla olevat virheet.',
    save: 'Tallenna',
    cancel: 'Peruuta',
    edit: 'Muokkaa',
    delete: 'Poista',
  },

  auth: {
    checkingSession: 'Tarkistetaan kirjautumista…',
    signedInAs: (name: string) => `Kirjautuneena: ${name}`,
    logIn: 'Kirjaudu sisään',
    loggingIn: 'Kirjaudutaan…',
    logOut: 'Kirjaudu ulos',
    signUp: 'Luo tili',
    signingUp: 'Luodaan tiliä…',
    email: 'Sähköposti',
    password: 'Salasana',
    displayName: 'Näyttönimi',
    switchToSignUp: 'Eikö sinulla ole tiliä? Luo tili',
    switchToLogIn: 'Onko sinulla jo tili? Kirjaudu sisään',
    errors: {
      invalidCredentials: 'Väärä sähköposti tai salasana.',
      emailTaken: 'Tällä sähköpostiosoitteella on jo tili.',
      fields: {
        email: 'Anna kelvollinen sähköpostiosoite.',
        displayName: 'Näyttönimi on pakollinen.',
        // Mirrors the server's MIN_PASSWORD_LENGTH — change both together.
        password: 'Salasanassa on oltava vähintään 8 merkkiä.',
      },
    },
  },

  sightings: {
    kindSighting: 'Havainto',
    kindKill: 'Kaato',
    kindGroup: 'Tyyppi',
    speciesGroup: 'Laji',
    otherSpecies: 'Muu',
    customSpeciesPlaceholder: 'Laji',
    customSpeciesLabel: 'Muu laji',
    person: 'Henkilö',
    unknownPerson: 'Tuntematon',
    donePerson: 'Valmis',
    editPerson: 'Muokkaa henkilöä',
    date: 'Päivämäärä',
    time: 'Kellonaika',
    notes: 'Lisätiedot',
    add: 'Lisää',
    move: 'Siirrä',
    confirmDelete: 'Poistetaanko merkintä? Tätä ei voi perua.',
    moveBanner: 'Napauta karttaa siirtääksesi merkinnän (Esc peruuttaa)',
    errors: {
      saveFailed: 'Tallennus epäonnistui. Yritä uudelleen.',
      deleteFailed: 'Poisto epäonnistui. Yritä uudelleen.',
      notFound: 'Merkintää ei enää ole.',
      fields: {
        lat: 'Virheellinen sijainti.',
        lng: 'Virheellinen sijainti.',
        species: 'Valitse laji tai kirjoita se.',
        kind: 'Virheellinen tyyppi.',
        observedDate: 'Virheellinen päivämäärä.',
        observedTime: 'Virheellinen kellonaika.',
      },
    },
  },

  tracks: {
    importButton: 'Tuo reittejä',
    reading: 'Luetaan…',
    loginToSave: 'Kirjaudu sisään tallentaaksesi reitit.',
    saving: 'Tallennetaan…',
    saveAll: 'Tallenna kaikki',
    clearAll: 'Tyhjennä kaikki',
    removeFile: (fileName: string) => `Poista ${fileName}`,
    pointCount: (count: number) => `${count} pistettä`,
    importedBy: (name: string) => `Tuonut: ${name}`,
    unknownImporter: 'tuntematon',
    deleteTrack: 'Poista reitti',
    deleting: 'Poistetaan…',
    confirmDelete: (name: string) => `Poistetaanko reitti "${name}"? Tätä ei voi perua.`,
    errors: {
      readFailed: (fileName: string) => `Tiedoston ${fileName} lukeminen epäonnistui.`,
      invalidFile: (formatLabel: string) => `Tiedostoa ei voitu lukea – se ei ole kelvollinen ${formatLabel}-tiedosto.`,
      noLocation: 'Tiedostossa ei ole sijaintitietoja.',
      unsupportedFormat: (fileName: string, supported: string) =>
        `Tiedostomuotoa ei tueta (${fileName}). Tuetut muodot: ${supported}.`,
      tooLarge: 'Reitti on liian suuri tallennettavaksi.',
      invalidTrack: 'Reitin tiedot ovat virheelliset.',
      notLoggedIn: 'Kirjaudu sisään nähdäksesi ja lisätäksesi reittejä.',
      notFound: 'Reittiä ei enää ole.',
      forbidden: 'Voit poistaa vain omia reittejäsi.',
      saveFailed: 'Tallennus epäonnistui. Yritä uudelleen.',
      deleteFailed: 'Poisto epäonnistui. Yritä uudelleen.',
    },
  },
}

export type Messages = typeof fi
