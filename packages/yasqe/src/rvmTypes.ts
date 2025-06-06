export type Langue = {
  id: string;
  locale: string;
  langueIso: string;
  dbValue: string;
};

export type RequeteEnregistree = {
  id: number;
  nom: string;
  requete: string;
  langue: Langue;
  horodateCreation: string;
  horodateModification: string;
};
