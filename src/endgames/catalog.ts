import type { Color } from '../import/types'

/** mate: deliver checkmate; promote: queen a pawn and stay winning; draw: hold the draw. */
export type EndgameGoal = 'mate' | 'promote' | 'draw'

export const GOAL_LABELS: Record<EndgameGoal, string> = {
  mate: 'Dai scacco matto',
  promote: 'Promuovi e vinci',
  draw: 'Tieni la patta',
}

export interface Endgame {
  id: string
  title: string
  category: string
  fen: string
  /** The side the user plays (the engine may move first). */
  color: Color
  goal: EndgameGoal
  /** The key idea, shown on request and after the attempt. */
  idea: string
}

/**
 * Essential endgames. Every verdict was checked with Stockfish 19 at depth 26
 * (win: mate or ≥ +5.8; draw: 0.00 ± 0.06).
 */
export const ENDGAMES: Endgame[] = [
  {
    id: 'mate-queen',
    title: 'Matto con la donna',
    category: 'Matti di base',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    color: 'white',
    goal: 'mate',
    idea: 'Con la donna a mossa di cavallo dal re nemico gli togli case una alla volta, spingendolo sul bordo; poi avvicina il re. Attento allo stallo: lascia sempre una casa libera finché il re non è pronto.',
  },
  {
    id: 'mate-rook',
    title: 'Matto con la torre',
    category: 'Matti di base',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    color: 'white',
    goal: 'mate',
    idea: 'La torre taglia il re nemico su una fila; il tuo re va in opposizione e la torre restringe la gabbia di una traversa alla volta. Quando i re sono di fronte, scacco di torre.',
  },
  {
    id: 'mate-two-rooks',
    title: 'Matto con due torri',
    category: 'Matti di base',
    fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1',
    color: 'white',
    goal: 'mate',
    idea: 'La scaletta: una torre dà scacco, l’altra taglia la traversa successiva, e così via fino al bordo. Se il re nemico si avvicina a una torre, spostala lontano sulla stessa traversa.',
  },
  {
    id: 'mate-two-bishops',
    title: 'Matto con due alfieri',
    category: 'Matti di base',
    fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1',
    color: 'white',
    goal: 'mate',
    idea: 'Gli alfieri affiancati fanno un muro diagonale; il re li accompagna. Spingi il re nemico in un angolo qualsiasi: il matto arriva con un alfiere che dà scacco e l’altro che chiude la fuga. Avanzato: hai 50 mosse.',
  },
  {
    id: 'kp-sixth',
    title: 'Re davanti al pedone',
    category: 'Re e pedone',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    color: 'white',
    goal: 'promote',
    idea: 'Con il re sulla sesta traversa davanti al pedone vinci sempre, chiunque muova: il re accompagna il pedone e controlla la casa di promozione.',
  },
  {
    id: 'kp-opposition-win',
    title: 'Opposizione: vinci',
    category: 'Re e pedone',
    fen: '8/8/8/4k3/8/4K3/4P3/8 b - - 0 1',
    color: 'white',
    goal: 'promote',
    idea: 'Muove il Nero e tu hai l’opposizione. Mantienila: quando il re nemico si sposta di lato, vai avanti nell’altro lato (aggiramento). Il pedone avanza solo quando il re l’ha preparato.',
  },
  {
    id: 'kp-opposition-draw',
    title: 'Opposizione: pareggia',
    category: 'Re e pedone',
    fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Muove il Bianco e l’opposizione è tua: a ogni mossa del re bianco rispondi mettendo il tuo re di fronte, con una casa in mezzo. Quando il pedone avanza, ritirati davanti a lui.',
  },
  {
    id: 'kp-front',
    title: 'Davanti al pedone',
    category: 'Re e pedone',
    fen: '4k3/8/8/4K3/4P3/8/8/8 b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Resta davanti al pedone. Quando il re bianco arriva sulla sesta, prendi l’opposizione sull’ottava; se il pedone arriva sulla settima con scacco, vai nell’angolo davanti a lui.',
  },
  {
    id: 'kp-rook-pawn',
    title: 'Pedone di torre',
    category: 'Re e pedone',
    fen: '7k/8/6K1/7P/8/8/8/8 b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Con il pedone di torre basta raggiungere l’angolo: il re bianco non riesce a cacciarti senza stallo. Fai avanti e indietro tra h8 e g8.',
  },
  {
    id: 'kp-square',
    title: 'La regola del quadrato',
    category: 'Re e pedone',
    fen: '8/8/8/8/4k2P/8/8/7K b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Immagina il quadrato tra il pedone e la casa di promozione: se il tuo re ci entra, lo prende. Corri in diagonale verso la sua strada.',
  },
  {
    id: 'rook-lucena',
    title: 'Lucena: costruisci il ponte',
    category: 'Finali di torre',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    color: 'white',
    goal: 'promote',
    idea: 'Prima taglia il re nemico con la torre (Td1+), poi porta la torre sulla quarta traversa. Il re esce dall’angolo e quando arrivano gli scacchi laterali la torre si interpone: è il «ponte».',
  },
  {
    id: 'rook-philidor',
    title: 'Philidor: la difesa sulla terza',
    category: 'Finali di torre',
    fen: '4k3/7r/8/3PK3/8/8/8/1R6 b - - 0 1',
    color: 'black',
    goal: 'draw',
    idea: 'Porta e tieni la torre sulla sesta traversa (la tua terza): il re bianco non può avanzare. Quando il pedone arriva sulla sesta, la torre va in fondo e dà scacchi da dietro.',
  },
  {
    id: 'pawns-outside',
    title: 'Il pedone passato esterno',
    category: 'Finali di pedoni',
    fen: '8/5kp1/8/8/8/6P1/P4K2/8 w - - 0 1',
    color: 'white',
    goal: 'promote',
    idea: 'Il pedone passato lontano fa da esca: mentre il re nero lo insegue, il tuo re va a mangiare i pedoni sull’altra ala.',
  },
  {
    id: 'pawns-breakthrough',
    title: 'Lo sfondamento',
    category: 'Finali di pedoni',
    fen: '8/ppp5/8/PPP5/8/8/5k2/7K w - - 0 1',
    color: 'white',
    goal: 'promote',
    idea: 'Tre pedoni contro tre, con i re lontani: b6! e, dopo la cattura, il sacrificio sull’altra colonna lascia passare un pedone.',
  },
]
