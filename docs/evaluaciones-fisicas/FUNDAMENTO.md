# Evaluaciones físicas por video: fundamento

> Estado: **investigación**, todavía no es spec ni plan. Recoge lo que se leyó
> para decidir qué medir, cómo y con qué respaldo. Fecha: 2026-09-23.

## 1. Qué se busca

Medir **potencia de salto** y **velocidad** de los jugadores en el club, sin
comprar hardware y sin subir videos a ningún lado, con resultados
**comparables** con los del CReAR (Centro Regional de Alto Rendimiento de
Rosario). Si algún día el club consigue una evaluación oficial cada 3–6 meses,
tiene que poder cargarse al lado de las propias y compararse. Pero la
funcionalidad **no depende** de que la municipalidad diga que sí.

Después, con menos prioridad: flexibilidad (Wells y Dillon), coordinación en
10 m y resistencia (Yo-Yo).

## 2. Qué mide el CReAR

**2024** (nota municipal [1]): 3.135 deportistas de 25 clubes. Batería básica:
saltar y alcanzar (Sargent), Wells y Dillon, coordinación de 10 m. Intermedia:
se suman sprint de 30 m y Yo-Yo endurance. Siguen los estándares del programa
juvenil del ENARD. Las evaluaciones avanzadas se hacen en el Cemedep y son
sólo para seleccionados.

**2025** (informe del Observatorio de Deporte y Turismo [4]):
- 2.222 deportistas de 22 instituciones y 11.783 evaluaciones. **El 74 % tenía
  entre 13 y 18 años** y el 57,3 % eran mujeres.
- Qué tests se tomaron y a qué proporción de los evaluados:

  | Test | Proporción aproximada |
  |---|---|
  | CMJ | ~100 % |
  | Abalakov | ~100 % |
  | Wells y Dillon | ~99 % |
  | Coordinación 10 m | ~90 % |
  | Sprint 30 m | ~58 % |
  | Otros (incluye el Yo-Yo) | < 5 % |

- Casi todo el volumen fue de vóley, fútbol y hockey, y el Club Atlético
  Provincial solo concentró el 54 % de las evaluaciones. **Básquet pesa poco en
  Evaluaciones**, pero es el deporte con más becados (274 becas, de 12 a 19
  años) y tiene Selección Permanente de 12 a 21 años. Si hay un canal
  institucional para conseguir evaluaciones, probablemente sea ese.

**Consecuencia clave:** en 2025 el salto se midió como **CMJ y Abalakov**, es
decir, por **tiempo de vuelo** (protocolo de Bosco [5]). Es la misma magnitud
que se mide con video, así que los resultados se pueden comparar (ver §4).
El Sargent de 2024 no se podía comparar: incluye el braceo y la técnica de
alcanzar la marca.

## 3. Tests elegidos

| Prioridad | Test | Cómo se mide | Respaldo |
|---|---|---|---|
| 1 | CMJ (manos en la cadera) | video en cámara lenta, 2 marcas | [6][7][8] |
| 1 | Abalakov (CMJ con brazos libres) | video en cámara lenta, 2 marcas | [7] (CMJ con brazos en chicos de 11–14) |
| 2 | Sprint de 30 m | video de costado, marcas en postes (método MySprint) | [23][24] |
| 3 | Wells y Dillon | carga manual en cm | protocolo CReAR/ENARD |
| 3 | Coordinación 10 m | carga manual (o video) | protocolo a conseguir |
| 4 | Yo-Yo | la app hace sonar los pitidos | protocolo a conseguir |

## 4. Salto por tiempo de vuelo

**Fórmula** (caída libre, Bosco 1983 [5]):

    h = g · tv² / 8        g = 9,81 m/s²

- `tv` es el tiempo entre el **último cuadro con el pie en el piso**
  (despegue) y el **primer cuadro con el pie otra vez en el piso**
  (aterrizaje).
- La fórmula supone que el cuerpo despega y aterriza en la misma posición. Si
  el chico aterriza con las rodillas flexionadas, el vuelo dura más y la
  altura sale **inflada**. Por eso el protocolo exige despegar y aterrizar con
  las piernas extendidas.

**Error según los cuadros por segundo.** Equivocarse en un cuadro es
equivocarse en `Δt = 1/fps`, y el error en altura es `Δh ≈ g·tv·Δt/4`. Para
un salto de 30 cm (`tv ≈ 0,49 s`):

| fps | Δt | Δh | Error sobre 30 cm |
|---|---|---|---|
| 30 | 33 ms | ±4,0 cm | 13 % |
| 60 | 17 ms | ±2,0 cm | 7 % |
| 120 | 8 ms | ±1,0 cm | 3 % |
| 240 | 4 ms | ±0,5 cm | 1,7 % |

El cambio real que interesa detectar en un CMJ es del orden de 1–1,5 cm, así
que **a 30 fps no se ve si un chico mejoró**. El mínimo útil es 120 fps y lo
recomendado, 240.

**Validación del método:**
- **Balsalobre-Fernández et al. 2015 [6]:** My Jump, iPhone a 240 fps, contra
  plataforma de fuerza. Correlación casi perfecta. Muestra: adultos activos.
- **Bogataj et al. 2020 [7]:** My Jump 2 contra OptoJump, en **48 chicos de
  11–14 años**, con SJ, CMJ y CMJ con brazos. Test-retest con ICC > 0,89.
  **Es el respaldo más directo para nuestra población.**
- **My Jump Lab con IA (2024) [8]:** detección automática a 60 Hz, con un
  sesgo de ≈ +1,6 cm contra plataforma. Muestra adulta y chica.
- **Otras de la misma suite:** métricas de estrategia en CMJ [9] y un índice
  de rebote en drop jump [10].

**Protocolo propuesto** (a validar con el profe y, si se puede, con el
CReAR):
- Posición: parado, frente a la cámara o de costado, con los pies bien
  visibles.
- CMJ con manos en la cadera; Abalakov con brazos libres.
- Profundidad del contramovimiento a elección del chico.
- En el aire, piernas extendidas; aterrizar con piernas extendidas.
- 3 intentos válidos, con 30–60 s de pausa entre intentos; se registra el
  mejor.
- Se guardan **todos los intentos**: la dispersión entre ellos mide el ruido
  individual (§8).

## 5. Potencia y "perfil fuerza-velocidad"

### 5.1 Qué se puede calcular con un salto sin carga

El método simple de Samozino (2008 para SJ [11], validado en CMJ por
Jiménez-Reyes 2017 [12]) usa la masa `m`, la altura `h` y el recorrido de
empuje `hpo`:

    F = m·g·(h/hpo + 1)      v = √(g·h/2)      P = F·v
    hpo = L0 − hpush    (L0: pierna extendida; hpush: trocánter–piso en la posición flexionada)

Son valores **promedio de la fase de empuje de ese salto**. Sirven para
comparar chicos de distinto peso: a igual altura de salto, el que pesa más
hizo más potencia.

Costos:
- Hay que medir `L0` y `hpush`, lo que implica palpar el trocánter mayor. En
  menores hace falta un protocolo claro: quién mide, con qué consentimiento y
  en presencia de quién.
- Hay que tener el peso del día (o reciente) en `medicion_corporal`.

→ **Dato secundario y opcional.** Se calcula sólo si están cargados `L0` y
`hpush`.

### 5.2 El perfil fuerza-velocidad y por qué queda afuera de la v1

Un músculo puede hacer **mucha fuerza lento** o **poca fuerza rápido**. El
perfil F-V es la recta que une esos extremos para una persona. Para dibujarla
hay que saltar **con distintas cargas**:
- Sin carga: rápido, poca fuerza.
- Con una barra pesada: lento, mucha fuerza.

La teoría de Samozino y Morin [13][14][15] dice que, para cada persona, hay
una inclinación óptima de esa recta. Si alguien está "desbalanceado"
(`FVimb`), convendría entrenar el lado que le falta. Jiménez-Reyes 2016 [16]
reportó mejoras con ese enfoque, y García-Ramos 2021 [17] propone medirlo con
sólo dos cargas.

Por qué no lo incluimos:
1. **Con un salto sin carga hay un solo punto, y con un punto no se traza una
   recta.** Hace falta barra y varias cargas: 20–80 % del peso corporal, o dos
   cargas con el método de 2 puntos. En chicos de 13–17 que juegan básquet
   en el club no es práctico ni habitual.
2. **La inclinación de la recta es poco confiable.** Si se mide dos veces al
   mismo chico, el perfil puede salir distinto. El propio meta-análisis que
   la apoya lo reconoce [21].
3. **El ensayo controlado más citado en contra (Lindberg 2021 [20])**, con 40
   atletas de deportes de equipo, no encontró ventaja en entrenar según el
   desequilibrio F-V frente a un entrenamiento balanceado.
4. **No hay evidencia en juveniles.** El meta-análisis de 2026 [21] encuentra
   ventaja en salto, pero con 6 estudios de adultos de ~22 años y sin datos de
   jóvenes. Además, en chicos el perfil cambia con la maduración [22].
5. **La altura de salto no es lo mismo que la potencia** (Samozino 2020 [19]).
   Es cierto, pero para seguir la evolución de un mismo chico, con el mismo
   protocolo, la altura alcanza, y es lo que tiene respaldo en nuestra edad.

Si en el futuro un club con preparador físico y material lo pide, el método
de 2 puntos [17] es la puerta de entrada.

## 6. Sprint de 30 m

**El problema actual:**
- `medicion_velocidad` guarda segundos con **un decimal** y cronometrados a
  mano.
- El cronómetro manual da tiempos sistemáticamente **más rápidos** que el
  electrónico: 0,22–0,26 s en 40 yardas (Mann 2015 [27]).
- Según Hetzler 2008 [26], sirve para promedios de grupo pero **no se puede
  corregir de forma confiable** a valores electrónicos.

Por eso hoy ese dato no se compara con el CReAR, que usa fotocélulas, ni
detecta mejoras de décimas.

**Método MySprint** (Romero-Franco 2017 [23]): un solo celular filmando de
costado. Contra fotocélulas, los parciales dieron r = 0,989–0,999.

Montaje para 30 m, según la aplicación en juveniles [24]:
- Trípode a 1 m de altura (a la altura de la cadera), **a 10 m perpendicular**
  del punto medio (15 m).
- Seis postes en **5,57 / 10,28 / 15 / 19,72 / 24,43 / 29,15 m**. Están
  corridos hacia el centro para compensar el paralaje: la línea de visión
  cámara→poste corta el carril del corredor en 5, 10, 15, 20, 25 y 30 m.
  - La regla general es `poste = 15 + (s − 15)·k`, con `k ≈ 0,943` para esa
    geometría. Si la cámara va a otra distancia, `k` cambia y la app puede
    calcular dónde van los postes.
- Arranque desde tres apoyos. El tiempo empieza **cuando la mano se despega
  del piso**.

**Cautelas:**
- En [24] se filmó a **60 fps**, y el perfil F-V de sprint dio sesgado contra
  el radar. Los autores atribuyen el error sobre todo a **identificar a mano
  el cuadro del arranque**. Para *tiempos* (no para perfil F-V) a 240 fps el
  error por cuadro es de 4 ms. El arranque sigue siendo el punto débil.
- Cubrir 30 m desde 10 m pide un campo de visión horizontal de ~113°, es
  decir, **gran angular**. Con la lente principal (~74°) la cámara tiene que
  ir a ~20 m, y ahí la mano del arranque se ve chica.
- **Una cancha de básquet mide 28 m.** El sprint de 30 m necesita un espacio
  más largo, o usar 20 m (que también se usa como test).

**Alternativa con varios celulares.** Photo Finish (2024 [25]) tiene un error
de 0,01 s contra fotocélulas, pero es una app nativa que sincroniza varios
teléfonos.
- En el navegador, una opción **no validada** es sincronizar dos videos por un
  aplauso que graben los dos. El retraso del sonido, `d/343` s, se corrige
  porque la distancia se conoce.
- Queda como idea para explorar, no como plan.

## 7. Captura y procesamiento del video

**Privacidad y costo:**
- El video se abre con `URL.createObjectURL`, se procesa en el celular y se
  descarta con `revokeObjectURL`.
- Al servidor sólo van números: tiempos de los cuadros marcados, fps, método
  y resultado.
- No hay almacenamiento de video y no hay costo por jugador.

**Frecuencia de cuadros y cámara lenta: el riesgo técnico principal**
- **Samsung (modo "Cámara lenta", 240 fps):** según reportes de usuarios,
  guarda un archivo **de 30 fps estirado en el tiempo**, sin indicar en el
  archivo que se grabó a 240 [30].
  - El `currentTime` del navegador queda en tiempo de reproducción: para
    obtener segundos reales hay que dividir por el factor (240/30 = 8).
  - Falta confirmar que el estiramiento sea **uniforme en todo el clip**, sin
    tramos a velocidad normal al principio o al final, y si el archivo trae la
    metadata `com.android.capture.fps`.
- **iPhone:** la cámara lenta guarda frecuencia variable, con tramos rápidos y
  lentos en el mismo archivo. Al elegirlo desde Safari puede convertirse
  [32].
- **Prohibido:** la "cámara lenta instantánea" o "super cámara lenta con IA"
  de los Galaxy S24 **inventa cuadros por interpolación** [31]. Los cuadros
  interpolados no son tiempo real. La app tiene que pedir el modo "Cámara
  lenta" común y rechazar resultados imposibles.
- **Control de sentido común:** un tiempo de vuelo humano está entre ~0,2 y
  ~0,9 s. Si el cálculo da 3,5 s, el factor de estiramiento está mal.

**Moverse cuadro por cuadro en el navegador:**
- El elemento `<video>` no informa los fps, y el salto a una posición no es
  exacto cuadro por cuadro.
- `requestVideoFrameCallback` da el `mediaTime` real del cuadro mostrado
  [28][29]. Se usa para identificar cada cuadro, y los tiempos se calculan
  como **diferencia de `mediaTime`**, no como `n/fps`.
- Si hiciera falta precisión exacta, WebCodecs más un lector de MP4 son el
  plan B.

**Kinovea:** es software libre (GPLv2) que valida el cronometraje por
cuadros [33].
- **Se toma la idea, no el código:** copiar código GPL en una web que se
  distribuye al navegador obligaría a liberar la app con esa licencia.
- La matemática es trivial y se escribe desde cero.

**Iluminación:** a 240 fps la exposición es ≤ 1/240 s.
- En gimnasios con poca luz el video sale oscuro.
- Las luces LED o fluorescentes titilan a 100 Hz (red de 50 Hz) y producen
  bandas.
- Ninguna de las dos cosas cambia los tiempos, pero sí la facilidad de ver el
  pie despegar.

## 8. Lo que más le sirve al profe: cambio real contra ruido

Con 3 intentos por sesión se puede estimar la variabilidad de cada chico (y
la del grupo). La app puede mostrar si una mejora supera el ruido de la
medición, en vez de un número suelto.

Se usan el error típico y el cambio mínimo relevante: ~0,2 veces el desvío
entre sujetos, un criterio clásico de Hopkins. **Falta sumar la cita
primaria.**

## 9. Descartado o postergado, y por qué

| Qué | Por qué |
|---|---|
| Perfil F-V con cargas | §5.2 |
| Referencias de Runmatic [34][35] | miden mecánica de carrera (rigidez, zancada), no tiempo de sprint |
| Sargent | no se puede comparar con el tiempo de vuelo, y el CReAR ya no lo usa |
| Detección automática con IA | fase 2: sugerir el cuadro y que el profe confirme |
| Drop jump y asimetría (Read 2016 [18]) | v2: relevante en juveniles como factor de riesgo de lesión |
| Copiar código de Kinovea | licencia GPL |
| Guardar videos | costo de almacenamiento y privacidad de menores |

## 10. Verificaciones pendientes (Galaxy S24 FE)

1. ~~Factor de estiramiento y uniformidad.~~ **Verificado el 2026-09-23**
   con un cronómetro filmado en "Cámara lenta" (S24 FE, Android 16):
   - El archivo es HEVC 1920×1080 a 30 fps nominales y trae la metadata
     **`com.android.capture.fps = 240.000000`**. El factor se puede leer del
     archivo, sin preguntarle al usuario.
   - Cuadros cada 33,33 ms de archivo, con una variación de ±0,2 ms.
   - Contra el cronómetro: 1.700 cuadros = 7,10 s reales → **4,18 ms por
     cuadro (≈ 239,5 fps)**, lineal de punta a punta (se revisaron 16 puntos
     con error ≤ 0,01 s). No hay tramos a velocidad normal.
   - **Anomalía:** el cuadro 0 queda suelto, 1,17 s antes del resto. Hay que
     ignorarlo; los tiempos se toman siempre como diferencia entre cuadros
     marcados.
   - El archivo trae la **ubicación GPS** en la metadata. Es un motivo más
     para no subir nunca el video.
   - **HEVC:** Chrome en Android lo reproduce con el decodificador del
     teléfono, pero en muchas PC no anda. Si hace falta analizar en PC,
     desactivar "Videos de alta eficiencia" en la cámara para grabar en
     H.264.
2. **Verdad física.** Soltar una pelota desde 1,226 m, que deberían ser
   **0,500 s** de caída (`t = √(2h/g)`). Contar cuadros: se esperan ~120 a
   240 fps reales.
3. **Metadata.** Pasar los archivos a la PC y leer los fps guardados, la
   duración y la metadata de captura.
4. **Navegador.** Cargar el archivo en Chrome Android con una página de
   prueba y verificar que `requestVideoFrameCallback` avance cuadro por
   cuadro.
5. **Salto real.** 3 CMJ filmados; marcar los cuadros y ver que la
   dispersión entre intentos sea de menos de ~1 cm.
6. **Sprint.** Ver qué lentes permite el modo "Cámara lenta" (¿gran angular?)
   y si la mano del arranque se distingue a la distancia necesaria.

## 11. Fuentes

**CReAR / Municipalidad de Rosario**
1. Municipalidad de Rosario. *CReAR 2024: multitudinaria edición de los juegos y más de 12.000 mediciones a 3.100 deportistas de la ciudad.* https://www.rosarionoticias.gob.ar/page/noticias/id/548507/
2. Municipalidad de Rosario. *Juegos CReAR 2026: el Centro de Evaluaciones deportivas será uno de los espacios de formación del evento.* https://www.rosarionoticias.gob.ar/page/noticias/id/673337/
3. Rosario Datos. *Centro Regional de Alto Rendimiento (CReAR).* https://datos.rosario.gob.ar/deporte-y-recreacion/deporte-federado/centro-regional-de-alto-rendimiento-crear
4. Observatorio de Deporte y Turismo, Municipalidad de Rosario. *Centro Regional de Alto Rendimiento (CReAR). Estadísticas año 2025.* Enero 2026 (PDF, copia local del usuario).

**Salto vertical**

5. Bosco C, Luhtanen P, Komi PV. A simple method for measurement of mechanical power in jumping. *Eur J Appl Physiol* 50: 273–282, 1983.
6. Balsalobre-Fernández C, Glaister M, Lockey RA. The validity and reliability of an iPhone app for measuring vertical jump performance. *J Sports Sci* 33: 1574–1579, 2015. https://pubmed.ncbi.nlm.nih.gov/25555023/
7. Bogataj Š, Pajek M, Hadžić V, Andrašić S, Padulo J, Trajković N. Validity, reliability, and usefulness of My Jump 2 app for measuring vertical jump in primary school children. *Int J Environ Res Public Health*, 2020. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7277223/
8. Balsalobre-Fernández C, et al. The validity and reliability of the My Jump Lab app for the measurement of vertical jump performance using artificial intelligence. *Sensors* 24(24): 7897, 2024. https://pmc.ncbi.nlm.nih.gov/articles/PMC11679296/
9. Bishop C, Jarvis P, Turner A, Balsalobre-Fernández C. Validity and reliability of strategy metrics to assess countermovement jump performance using the newly developed My Jump Lab smartphone application. 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9465756/
10. Smartphone-based assessment of the stretch–shortening cycle: validity and reliability of the My Jump Lab app for measuring the Dynamic Rebound Index. *Sensors*, 2026. https://doi.org/10.3390/s26103068

**Potencia y perfil fuerza-velocidad**

11. Samozino P, Morin JB, Hintzy F, Belli A. A simple method for measuring force, velocity and power output during squat jump. *J Biomech* 41: 2940–2945, 2008.
12. Jiménez-Reyes P, Samozino P, Pareja-Blanco F, et al. Validity of a simple method for measuring force-velocity-power profile in countermovement jump. *Int J Sports Physiol Perform* 12(1): 36–43, 2017. https://journals.humankinetics.com/view/journals/ijspp/12/1/article-p36.xml
13. Samozino P, Rejc E, Di Prampero PE, Belli A, Morin JB. Optimal force-velocity profile in ballistic movements — altius: citius or fortius? *Med Sci Sports Exerc* 44: 313–322, 2012.
14. Samozino P, Edouard P, Sangnier S, Brughelli M, Gimenez P, Morin JB. Force-velocity profile: imbalance determination and effect on lower limb ballistic performance. *Int J Sports Med* 35: 505–510, 2014.
15. Morin JB, Samozino P. Interpreting power-force-velocity profiles for individualized and specific training. *Int J Sports Physiol Perform* 11: 267–272, 2016.
16. Jiménez-Reyes P, Samozino P, Brughelli M, Morin JB. Effectiveness of an individualized training based on force-velocity profiling during jumping. *Front Physiol* 7: 677, 2016.
17. García-Ramos A, Pérez-Castilla A, Jaric S. Optimisation of applied loads when using the two-point method for assessing the force-velocity relationship during vertical jumps. *Sports Biomech*, 2021.
18. Read PJ, Oliver JL, De Ste Croix MBA, Myer GD, Lloyd RS. Neuromuscular risk factors for knee and ankle ligament injuries in male youth soccer players. *Sports Med* 46: 1059–1066, 2016.
19. Samozino P, et al. When jump height is not a good indicator of lower limb maximal power output: theoretical demonstration, experimental evidence and practical solutions. *Sports Med*, 2020. https://link.springer.com/article/10.1007/s40279-019-01073-1
20. Lindberg K, et al. Should we individualize training based on force-velocity profiling to improve physical performance in athletes? *Scand J Med Sci Sports* 31: 2198–2210, 2021. https://onlinelibrary.wiley.com/doi/10.1111/sms.14044
21. Effect of force-velocity profile-based individualized vs. non-individualized strength training on force-velocity profiles and athletic performance: a systematic review and meta-analysis. *BMC Sports Sci Med Rehabil*, 2026. https://pmc.ncbi.nlm.nih.gov/articles/PMC13556050/
22. Examination of the sprinting and jumping force-velocity profiles in young soccer players at different maturational stages. 2021. https://pubmed.ncbi.nlm.nih.gov/33925544/

**Sprint**

23. Romero-Franco N, Jiménez-Reyes P, Castaño-Zambudio A, et al. Sprint performance and mechanical outputs computed with an iPhone app: comparison with existing reference methods. *Eur J Sport Sci* 17(4), 2017. https://onlinelibrary.wiley.com/doi/10.1080/17461391.2016.1249031
24. Validity and reliability of sprint force-velocity profiling in elite football: comparison of MySprint, GPS, and radar devices. *PLOS One*, 2025. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0325611
25. Analysis of the validity and reliability of the Photo Finish® smartphone app to measure sprint time. *Sensors* 24(20): 6719, 2024. https://www.mdpi.com/1424-8220/24/20/6719
26. Hetzler RK, Stickley CD, Lundquist KM, Kimura IF. Reliability and accuracy of handheld stopwatches compared with electronic timing in measuring sprint performance. *J Strength Cond Res* 22(6), 2008. https://pubmed.ncbi.nlm.nih.gov/18978613/
27. Mann JB, et al. Validity and reliability of hand and electronic timing for 40-yd sprint in college football players. *J Strength Cond Res*, 2015. https://www.ovid.com/jnls/nsca-jscr/abstract/10.1519/jsc.0000000000000941

**Video en el navegador y en celulares**

28. web.dev. *Perform efficient per-video-frame operations on video with requestVideoFrameCallback().* https://web.dev/articles/requestvideoframecallback-rvfc
29. MDN. *HTMLVideoElement.requestVideoFrameCallback().* https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
30. Samsung. *Difference between Super Slow Mo and Slow Motion Video.* https://www.samsung.com/sg/support/mobile-devices/what-is-super-slow-mo-and-how-is-it-different-from-slow-motion-video/ — y reportes de usuarios en XDA / Samsung Community sobre archivos de cámara lenta guardados a 30 fps.
31. Samsung Newsroom. *Galaxy S24 Series: Six Camera Features That Ensure You Never Miss a Moment* (Instant Slow-Mo con interpolación por IA). https://news.samsung.com/us/galaxy-s24-series-six-camera-features-that-ensure-you-never-miss-a-moment/
32. Android Developers. *High-Speed Capture and Slow-Motion Video with CameraX 1.5.* https://developer.android.com/blog/posts/high-speed-capture-and-slow-motion-video-with-camera-x-1-5 — y totalmedia.ai sobre la frecuencia variable de la cámara lenta en iPhone.
33. Kinovea (GPLv2). https://www.kinovea.org/

**Citadas por My Jump Lab pero no aplicables al sprint de 30 m**

34. Balsalobre-Fernández C, Agopyan H, Morin JB. The validity and reliability of an iPhone app for measuring running mechanics. *J Appl Biomech*, 2016.
35. Morin JB, Dalleau G, Kyröläinen H, Jeannin T, Belli A. A simple method for measuring stiffness during running. *J Appl Biomech* 21: 167–180, 2005.

    También listan: Moore 2016 (economía de carrera), Balsalobre-Fernández
    2016 (fuerza y economía de carrera), Buchheit 2015 (rigidez con GPS),
    Hewit 2012 (asimetría), Bramah 2018 (báscula pélvica).
