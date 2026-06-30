export type MomentVisual = {
  momentId: string
  sceneId: string
  title: string
  src: string
}

export const BOOK1_SCENE_VISUALS: Record<string, MomentVisual> = {
  'Ch1-Intro2': momentVisual('Ch1-Intro2', 'ch1-forest-arrival', 'Barry arrives in Varathia'),
  'Ch1-Cutthroat Dave': momentVisual('Ch1-Cutthroat Dave', 'ch1-cutthroat-dave', 'Cutthroat Dave pins Barry to the tree'),
  'Ch2-Intro': momentVisual('Ch2-Intro', 'ch2-kate-appears', 'Kate appears behind Barry and Daren'),
  'Ch2-Battle-begins': momentVisual('Ch2-Battle-begins', 'ch2-mage-ambush', 'Kate shows real magic'),
  'Ch2-Deer': momentVisual('Ch2-Deer', 'ch2-elaria-molan', 'Elaria and Molan at the forest edge'),
  'Ch3-Plate': momentVisual('Ch3-Plate', 'ch3-cave-meal', "Meal inside Elaria's cave"),
  'Ch3-Dart': momentVisual('Ch3-Dart', 'ch3-crossbow-ambush', 'The hidden crossbowmen strike'),
  'Ch3-Ice-hand': momentVisual('Ch3-Ice-hand', 'ch3-kate-ice-defense', "Kate's ice defense"),
  'Ch3-Lift': momentVisual('Ch3-Lift', 'ch3-barry-tree-lift', 'Barry lifts the tree'),
  'Ch4-Intro2': momentVisual('Ch4-Intro2', 'ch4-eiden-arrival', 'Eiden arrives with eyes closed'),
  'Ch4-Dave-vs-Eiden': momentVisual('Ch4-Dave-vs-Eiden', 'ch4-dave-vs-eiden', 'Dave threatens Eiden'),
  'Ch4-Barry-vs-Dave': momentVisual('Ch4-Barry-vs-Dave', 'ch4-barry-vs-dave', 'Barry faces Cutthroat Dave'),
  'Ch5-Wake-Kate': momentVisual('Ch5-Wake-Kate', 'ch5-wake-kate', 'Aftermath with Kate'),
  'Ch5-Scream': momentVisual('Ch5-Scream', 'ch5-rose-scream', "Rose's scream in the distance"),
  'Ch5-Goblins2': momentVisual('Ch5-Goblins2', 'ch5-goblin-rescue', 'The goblins and Rose'),
  'Ch6-Intro': momentVisual('Ch6-Intro', 'ch6-cave-prep', 'Preparing near the cave'),
  'Ch6-Packing': momentVisual('Ch6-Packing', 'ch6-barry-packing-crossbow', 'Barry packs the crossbow'),
  'Ch6-Dragon': momentVisual('Ch6-Dragon', 'ch6-tyrath-arrival', 'Tyrath arrives'),
  'Ch6-Time-weaver': momentVisual('Ch6-Time-weaver', 'ch6-time-weaver', 'Time Weaver pressure'),
  'Ch7-Diane': momentVisual('Ch7-Diane', 'ch7-diane-tension', "Kate and Diane's tense reunion"),
  'Ch7-Giant': momentVisual('Ch7-Giant', 'ch7-hadrik-giant', 'Hadrik reveals his giant truth'),
  'Ch7-Wait': momentVisual('Ch7-Wait', 'ch7-azarius-duel', 'Azarius presides over the chaos'),
  'Ch7-Dwarf-vs-fire': momentVisual('Ch7-Dwarf-vs-fire', 'ch7-hadrik-vs-felran', "Hadrik against Felran's fire"),
  'Ch8-Intro2': momentVisual('Ch8-Intro2', 'ch8-prison-collars', 'Captured by the animal kingdom'),
  'Ch8-Talk2': momentVisual('Ch8-Talk2', 'ch8-eleya-judgment', 'Eleya judges the intruders'),
  'Ch8-Training': momentVisual('Ch8-Training', 'ch8-flower-training', 'Flower drops into the ruined room'),
  'Ch8-Hydra': momentVisual('Ch8-Hydra', 'ch8-hydra-room', 'The hydra trap'),
  'Ch8-Control-room': momentVisual('Ch8-Control-room', 'ch8-control-room', 'The ancient control room'),
  'Ch9-Intro': momentVisual('Ch9-Intro', 'ch9-stronghold-road', 'Road toward the ogre stronghold'),
  'Ch9-Awakening': momentVisual('Ch9-Awakening', 'ch9-flower-illuna-origin', "Flower and Illuna's shared origin"),
  'Ch9-Inventory': momentVisual('Ch9-Inventory', 'ch9-enchanted-backpack', 'Barry discovers the enchanted backpack'),
  'Ch9-Muffled': momentVisual('Ch9-Muffled', 'ch9-ogre-ambush', 'The ogres close in'),
  'Ch9-Submission': momentVisual('Ch9-Submission', 'ch9-illuna-golden-cage', "Illuna's golden cage"),
  'Ch10-Treasury': momentVisual('Ch10-Treasury', 'ch10-ogre-plan', 'Planning inside the ogre fortress'),
  'Ch10-Teleport': momentVisual('Ch10-Teleport', 'ch10-pit-rescue', 'Illuna rescues Daren from the collapsing pit'),
  'Ch10-Wolves': momentVisual('Ch10-Wolves', 'ch10-ritual-wolves', 'Red eyes in the ritual fog'),
  'Ch10-Toast': momentVisual('Ch10-Toast', 'ch10-after-ogres', 'After the ogre conflict'),
  'Ch10-Ending': momentVisual('Ch10-Ending', 'ch10-eiden-confrontation', 'Eiden confronts Barry'),
  'Ch11a-Luxurious': momentVisual('Ch11a-Luxurious', 'ch11a-thilias-gates', 'The real Thilias'),
  'Ch11a-Power': momentVisual('Ch11a-Power', 'ch11a-eiden-slavery-intervention', 'Eiden intervenes in Thilias'),
  'Ch11a-Toy': momentVisual('Ch11a-Toy', 'ch11a-rose-home', "Rose's home and Suzie's toy"),
  'Ch11a-Incriminated': momentVisual('Ch11a-Incriminated', 'ch11a-beggars-district-trap', "The Beggar's district trap"),
  'Ch11b-Clones': momentVisual('Ch11b-Clones', 'ch11b-clone-ambush', 'The clone ambush begins'),
  'Ch11b-Monster': momentVisual('Ch11b-Monster', 'ch11b-skeletal-dragon', 'The skeletal dragon threat'),
  'Ch11b-Sacrificial': momentVisual('Ch11b-Sacrificial', 'ch11b-zack-sacrifice', "Zack's sacrificial ritual"),
  'Ch11b-Ending': momentVisual('Ch11b-Ending', 'ch11b-golmyck-announcement', 'Golmyck appears on giant screens'),
}

export function getBook1SceneVisual(sceneId: string | null | undefined) {
  return sceneId ? BOOK1_SCENE_VISUALS[sceneId] ?? null : null
}

function momentVisual(sceneId: string, momentId: string, title: string): MomentVisual {
  return {
    sceneId,
    momentId,
    title,
    src: `/visuals/book1/moments/${momentId}/illustration.webp`,
  }
}
