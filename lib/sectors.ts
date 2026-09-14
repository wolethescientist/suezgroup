/**
 * The five operating companies, as a photographic sequence.
 *
 * The group site used to open on a single Suez Gas photograph, which sold one
 * company rather than the group. This is the fix: one slide per subsidiary,
 * each with its own write-up, cycling behind the hero, the about hero and the
 * closing band so the parent brand reads as the sum of its parts.
 *
 * Photographs are library images (Pexels — free for commercial use). Captions
 * describe the PRACTICE, never possession: no stock frame on this site claims
 * to be Suez equipment. See public/photos/sectors/README.md for sources.
 */

export type SectorSlide = {
  id: string;
  /** The operating company the frame stands for. */
  company: string;
  /** What that company does, in two or three words. */
  sector: string;
  photo: string;
  /** Describes the photograph itself — never claims it is a Suez asset. */
  alt: string;
  /** Full write-up, shown in the hero panel. */
  body: string;
  /** One line, for the compact caption on secondary pages. */
  note: string;
  /** object-position for the frame, where the centre crop is not the subject. */
  position?: string;
};

export const SECTOR_SLIDES: SectorSlide[] = [
  {
    id: "gas",
    company: "Suez Gas Nigeria",
    sector: "LPG distribution",
    photo: "/photos/sectors/gas.jpg",
    alt: "Rows of LPG cylinders racked at a filling plant",
    body:
      "Cylinder refills from 3kg to 50kg, doorstep pick-up and return, bulk supply, tank telemetry and installation — every cylinder weighed in front of the customer.",
    note: "Every cylinder weighed in front of the customer.",
    position: "58% 50%",
  },
  {
    id: "trading",
    company: "Suez Trading Internationale",
    sector: "Supply, haulage & works",
    photo: "/photos/sectors/trading.jpg",
    alt: "A road tanker running at speed on an open highway",
    body:
      "Seven divisions on one value chain — petroleum products, oilfield services, haulage, construction, general supplies, facility services and FMCG distribution.",
    note: "Seven divisions, thirty-six states, 24–72 hours.",
    position: "62% 50%",
  },
  {
    id: "electric",
    company: "SuezElectric",
    sector: "Prepaid electricity",
    photo: "/photos/sectors/electric.jpg",
    alt: "A row of prepaid electricity meters mounted on a building wall",
    body:
      "Prepaid tokens generated on demand across eleven distribution companies, with a wallet, an agent network and a receipt that survives an argument with a landlord.",
    note: "Tokens across eleven discos, in seconds.",
    position: "64% 50%",
  },
  {
    id: "software",
    company: "Suez Software",
    sector: "Digital products",
    photo: "/photos/sectors/software.jpg",
    alt: "Application source code open on a screen in a dark room",
    body:
      "The group's product layer: the vending platforms, commerce storefronts and internal tools the rest of the network runs on — built in-house, not bought in.",
    note: "The platforms the network runs on, built in-house.",
    position: "50% 50%",
  },
  {
    id: "ict",
    company: "Suez ICT",
    sector: "Systems & connectivity",
    photo: "/photos/sectors/ict.jpg",
    alt: "Fibre patch cables terminated in a network rack",
    body:
      "Connectivity, integrations and technical infrastructure — the lane that keeps depots, agent kiosks, tankers, meters and payment rails talking to each other.",
    note: "Depots, kiosks and payment rails, kept online.",
    position: "52% 50%",
  },
];
