<!-- Transcripcion fiel via Gemini 2.5 Flash. Fuente: Chapter5.pdf. finishReason=STOP -->

Cite this book as:
Bozorg-Haddad, O., Zolghadr-Asli, B., & Loáiciga, H.A. (2020). “A Handbook on Multi-Attribute Decision-Making Methods.” Wiley & Sons Publication Inc., ISBN: 1119563496

Authors Scholar Page:
Omid Bozorg-Haddad:
https://scholar.google.com/citations?user=0CTEfTUAAAAJ&hl=en

Babak Zolghadr-Asli:
https://scholar.google.com/citations?user=6owBze4AAAAJ&hl=en

Hugo A. Loáiciga:
https://scholar.google.com/citations?user=WQ9iC9kAAAAJ&hl=en

A Handbook on Multi-Attribute
Decision-Making Methods

Omid Bozorg-Haddad
University of Tehran
Alborz, Iran

Babak Zolghadr-Asli
University of Tehran
Alborz, Iran

Hugo A. Loáiciga
University of California
Santa Barbara, United States

WILEY

59
# 5 The Best-Worst Method (BWM)

## 5.1 Introduction
As established thus far a decision matrix plays a crucial rule in the multiattribute decision-making (MADM) process. A decision matrix ($D$) is described as follows (Yu 1990):

$$
D = \begin{pmatrix}
C_1 & \dots & C_n \\
a_1 & r_{(1,1)} & \dots & r_{(1,n)} \\
\vdots & \vdots & \ddots & \vdots \\
a_m & r_{(m,1)} & \dots & r_{(m,n)}
\end{pmatrix} \quad (5.1)
$$

in which $a_i$ = the predetermined, feasible alternative; $c_j$ = the predefined evaluation criterion determined by the decision-maker; $r_{(i,j)}$ = the normalized value of the $i$th alternative with regard to the $j$th criterion; $m$ = the number of feasible alternatives; and $n$ = the number of criteria. The decision-maker attempts to choose the set of alternatives that would achieve the decision-makers main objective or goal that can be portrayed via a set of predetermined criteria. The MADM philosophy prescribes that if the poor performance of an alternative with regard to one of the predefined criterion is compensated by the alternative's good performance with regard to other criteria, such tradeoff can be accounted for by a compensatory method (Jeffreys 2004; Banihabib et al. 2017). Most compensatory MADM methods would attempt the aggregate the overall performance of each alternative through a weighting mechanism that assigns the proper weight to each of the predefined criteria. Such weighting mechanism is calculated mathematically as follows (Churchman and Ackoff 1954):

$$
V_i = \sum_{j=1}^{n} w_j \times r_{(i,j)} \quad (5.2)
$$

in which $V_i$ = the overall performance of the $i$th alternative; and $w_j$ = the weight assigned to the $j$th criterion. As stated earlier not all MADM methods imply

A Handbook on Multi-Attribute Decision-Making Methods, First Edition.
Omid Bozorg-Haddad, Babak Zolghadr-Asli, and Hugo A. Loáiciga.
© 2021 John Wiley & Sons, Inc. Published 2021 by John Wiley & Sons, Inc.

60
# 5 The Best-Worst Method (BWM)

weighting functions to aggregate to the overall performance of the feasible alternative vector; nevertheless, most compensatory methods use the aforementioned notion as the core idea of computing the alternatives' overall performance. In such cases, the principles, techniques, and assumption employed to derive these weights are what distinguishes these compensatory MADM methods.
Using a scale of a sort is the most common practice in MADM methods; however, designing a well-defined scale is a challenge, especially, in cases where the decision-maker is faced with intangible, nonquantitative variables (Saaty 1985, 1986, 1994). Implementing pairwise comparisons constitutes an alternate approach to overcome such difficulties (Saaty 1980, 1990; Saaty and Vargas 2006).
The pairwise comparison method was introduced by Thurstone (1927). Pairwise comparison main implication is to structure the decision matrix, but many borrowed the core idea behind these comparisons to extract the weighting functions required to deal with MADM problems (Saaty 1977, 1988, 1996). Pairwise comparisons are a strategy for determining the decision-makers' relative preferences of either alternatives or criteria with respect to the decision-makers' predetermined criteria and the main goal, respectively (Saaty 2004). The pairwise comparison has proven to be an effective tactic to tackle MADM problems where it is unfeasible or meaningless to provide a conventional scale system to estimate the scores of alternatives or criteria (Saaty 2005, 2006). One can claim that although in such cases the decision-maker is not using an explicitly defined scaling measure, yet, comparisons, which are the core element in such methods, are made based on the decision-makers' expertise, experience, and cognitive abilities, which constitute an implicit scale of judgment made by the decision-makers. A common criticism to employ such implicit, cognitive-oriented, scales of measurement, which is the basic foundation for pairwise comparison MADM methods, is that it can introduce error in the decision-making process. This is so because subjective criteria depend on the decision-makers' knowledge, experience, expertise, and cognitive reasoning, rather than a consistent, mathematically defined, and logically supported scale (Dyer 1990). Note that every decision-making method relies heavily on the expert's judgments when it comes to assessing intangible, quantitative attributes. The fact stands that any measurement, of any sort, would be based on an arbitrarily defined scale (Saaty 2008). While implying standard scales are advantageous in practice not all attributes can be assessed through such instruments. Therefore, it is inevitable to depend on the decision-makers' judgments on a subject matter at hand. Thus, personal-oriented assessments of an informed, rational, and unbiased decision-maker could not jeopardize the integrity of the pairwise comparison-based MADM method. In technical terms, the aforementioned notion is known as consistent decision-making (Rezaei 2015).

61
## 5.1 Introduction
The most significant challenge for MADM methods that are founded on the basis of the pairwise comparison, is to maintain the consistency of the pairwise comparison matrices, which usually becomes challenging in practical problems (Herman and Koczkodaj 1996). Note that maintaining consistency in a pairwise comparison matrix would not necessarily guarantee the authenticity and accuracy of the results, but rather ensures the existence of rationality in the decision-making process. Consider, for instance, a case where the decision-maker evaluates that the preference of item A is a time more significant than the item B, while the item B's preference is of b times more significant when it is compared to the item C. Rationality, consequently, would dictate for the preference of the item A to be of a × b more significant than the item C. If the decision-makers judgment would be in line with the aforementioned rational statement, the pairwise comparison is considered to be consistent. Yet, error in judgments regarding the decision-makers evaluation of either a or b could induce inaccuracy to the pairwise comparison. Using an expert's opinion would dramatically decrease the inaccuracy of the decision-making process, but maintaining a certain acceptable level of consistency remains an ongoing challenge for MADM methods that are pairwise comparison-oriented. Allegedly, limiting the number of pairwise comparisons seems to be a logical attempt to control and mitigate the inconsistency induced in such sorts of the decision-making process (Rezaei 2015).
The best-worst method (BWM), theorized by Rezaei (2015), is a compensatory MADM technique, which is based on a pairwise comparison of the best and the worst criteria or alternatives with regard the other criteria or alternatives, respectively. The preliminary studies illustrated its potential in solving practical, real-life MADM problems (Rezaei 2015, 2016). Since then, the BWM has been applied in numerous research fields including: Business planning (Torabi et al. 2016), educational and scientific agendas (Salimi and Rezaei 2016; Hafezalkotob and Hafezalkotob 2017), energy resources management (Ahmad et al. 2017), environmental and natural resources agendas (Chitsaz and Azarnivand 2017; Ren et al. 2017), human resources management (Yang et al. 2016), marketing (Rezaei et al. 2015, 2016), nation's strategic development planning (Gupta and Barua 2016), supplier section (Gupta and Barua 2017), transport policy appraisal (Annema et al. 2015), and transportation selection (Rezaei et al. 2017). Even though, some alternated, hyperlinked alteration has been suggested for the standard BWM (e.g. the fuzzy BWM (Mou et al. 2016; Guo and Zhao 2017), linked with a linear programming model (Rezaei 2016), and the BWM for an uncertain environment (Pamučar et al. 2017)), the reliable results and relative ease of computations made the BWM a promising method to handle real-world MADM problems. The following sections would contain a detailed description of the standard BWM methodology.

62
# 5 The Best-Worst Method (BWM)

## 5.2 Basic Principles of the BWM
The decision matrix introduced in Eq. (5.1) is the key in the decision-making process of compensatory methods such as the BWM. The basic idea is to derive and assign the proper weights to each criterion so that the overall performance of each alternative could be estimated. Assume a problem in which the decision-maker identified $n$ evaluating criteria for the MADM problem at hand. To do a pairwise comparison, the preference of all identified criteria are to be compared to one another and then rated in relative terms. In that regard, a pairwise comparison matrix is formed as follows (Saaty 1977):

$$
P = \begin{pmatrix}
C_1 & \dots & C_n \\
C_1 & P_{(1,1)} & \dots & P_{(1,n)} \\
\vdots & \vdots & \ddots & \vdots \\
C_n & P_{(n,1)} & \dots & P_{(n,n)}
\end{pmatrix} \quad \forall i \quad P_{(i,i)} = 1 \quad (5.3)
$$

in which $P$ = the pairwise comparison matrix of the identified criteria, and $P_{(i,j)}$ = the pairwise comparison of the $i$th alternative/criterion with the $j$th one. The decision-maker can use any numerical scale to make the pairwise comparison, but it is advisable to use a 1–9 scale for the BWM. A typical scale that can be employed for such pairwise comparisons is demonstrated in Table 5.1 (Saaty 1977, 1980; Rezaei 2015).
The reciprocal property is one the major conditions for the pairwise comparison matrix. Consequently, in Eq. (5.3) each element of the matrix ought to satisfy the following condition (Saaty 1986):

$$
P_{(i,j)} = 1/P_{(j,i)} \quad \forall i,j \quad (5.4)
$$

Every element of the pairwise comparison matrix reflects the decision-makers preference, yet some elements are more significant than others. With that regard Rezaei (2015) proposed to classify the elements of the pairwise comparison matrix

**Table 5.1** A typical pairwise comparison scale for the BWM.

| Intensity of decision-maker's preference | Definition                                            |
| :--------------------------------------- | :---------------------------------------------------- |
| 1                                        | Equally important                                     |
| 3                                        | Moderate preference of the $i$th criteria over the $j$th one |
| 5                                        | Strong preference of the $i$th criteria over the $j$th one   |
| 7                                        | Very strong preference of the $i$th criteria over the $j$th one   |
| 9                                        | Extreme preference of the $i$th criteria over the $j$th one   |
| 2, 4, 6, 8                               | Intermediate values between the two adjacent judgments |

Source: Saaty (1977, 1980) and Rezaei et al. (2015).

63
## 5.3 Stepwise Description of the BWM
into two main categories, namely, reference and secondary comparisons. Basically, a comparison $a_{(i,j)}$ is considered a reference comparison if $i$ is the best element and/or $j$ is the worst element, in any other case the $a_{(i,j)}$ belongs to the secondary comparison category. It can be shown that the number of reference comparisons would be equal to $2n - 3$ (Rezaei 2015, 2016).
The significance of limiting the decision-makers assessment to the set of reference comparisons is that one provides an environment through which the decision-maker is more likely to make more consistent comparisons due to the presence of a reference alternative/criteria (whether the best or worst alternative/criteria). In addition, the set of reference comparisons can be seen as an external information source that helps extract the set of secondary comparison, and thus the relative importance of every alternative/criteria in the pairwise comparison matrix without making any additional assessments. In mathematical terms, the aforementioned statement is based on the following characteristic of a consistent comparison (Saaty 1977):

$$
P_{(i,j)} = P_{(i,k)} \times P_{(k,j)} \quad (5.5)
$$

Equation (5.5) states reference comparisons are the external source of information, and each secondary comparison $P_{(i,j)}$ appears in two relational chains, whose two reference comparisons are as follows (Rezaei 2015):

$$
P_{(B,i)} \times P_{(i,j)} = P_{(B,j)} \quad (5.6)
$$

$$
P_{(i,j)} \times P_{(j,W)} = P_{(i,W)} \quad (5.7)
$$

in which $P_{(B,i)}$ and $P_{(B,j)}$ = the preference of the best alternative/criterion over the $i$th and $j$th alternative/criterion, respectively; and $P_{(i,W)}$ and $P_{(j,W)}$ = the preference of the $i$th and $j$th alternative/criterion over the worst alternative/criterion, respectively. Note that any deviation from the decision-makers estimation of $P_{(i,j)}$ and the $P_{(i,j)}$ calculated through Eqs. (5.6, 5.7) can be interoperated to evaluate the decision-makers' consistency of judgment, which will be discussed in the following sections.
The BWM is a pairwise comparison-oriented method, but unlike most practiced pairwise comparison MADM methods, it limits the decision-makers evaluation to the reference comparisons. Evidently, decreasing the number of comparisons made by the decision-maker would increase the accuracy and reliability of the decision-making process (Rezaei 2015). The following section presents a stepwise description of the BWM.

## 5.3 Stepwise Description of the BWM
The standard BWM is a five-step process involving pairwise comparisons matrix is employed to derive the weights of the criteria. These weights are used to obtain the alternatives' overall performance (see Eq. (5.2)).

64
# 5 The Best-Worst Method (BWM)

### 5.3.1 Step 1: Defining the Decision-Making Problem
The first step of the BWM, as is the case with every other MADM method, is to lay the framework through which the decision-making process takes place. The integrity of the final result would rely heavily on the accuracy of this initial, yet, vital step. The main idea of this step is for the decision-maker to mathematically express the decision-making problem, through a set of criteria, e.g. $\{C_1, C_2, \dots, C_n\}$, and alternatives, e.g. $\{a_1, a_2, \dots, a_m\}$. The decision matrix is the ideal instrument to do so. To that end, the decision-maker evaluates the alternatives with regard to each criterion and then normalizes the results with respect to each column $[r_{(i,j)}]$. Subsequently, the final decision matrix has the following property (Ma et al. 1999; Chang and Yeh 2001):

$$
\sum_{i=1}^{m} r_{(i,j)} = 1 \quad \forall j \quad (5.8)
$$

### 5.3.2 Step 2: Determining the Reference Criteria
Recall each element of the pairwise comparison matrix is either a reference or secondary comparison. Reference comparisons, which are the keys to the BWM, are those comparisons the decision-maker makes to evaluate each given criterion to determine what is the most and/or least important criterion. To that end, the decision-maker makes an implicit and general evaluation of all the predetermined criteria to identify the best (most important) and the worst (least important) criteria. The decision-maker identifies more than one reference criteria (either best or worst criterion) based on the decision-makers cognitive reasoning (Rezaei 2015).

### 5.3.3 Step 3: Pairwise Comparisons
The BWM is based on using reference comparisons, which refers to the comparisons that are made between the best criterion and the rest of the remaining criteria and/or those that are made between the predetermined criteria and the worst criterion. It is recommended to use a 1–9 numerical scale (Table 5.1) to made such comparisons. The results would eventually lead to forming two vectors, namely, best-to-others ($A_B$) and others-to-worst ($A_W$) vectors, respectively. The best-to-others ($A_B$) and others-to-worst ($A_W$) vectors are expressed by Eqs. (5.9, 5.10), respectively (Rezaei 2015).

$$
A_B = [P_{(B,1)}, P_{(B,2)}, \dots, P_{(B,j)}, \dots, P_{(B,n)}] \quad (5.9)
$$

$$
A_W = [P_{(1,W)}, P_{(2,W)}, \dots, P_{(j,W)}, \dots, P_{(n,W)}] \quad (5.10)
$$

65
## 5.3 Stepwise Description of the BWM

### 5.3.4 Step 4: Computing the Optimal Weights
This step combines the previously gathered information to assign proper weights to each give criteria. The following equations can be used to compute the weight of the $j$th criterion assuming that each pairwise comparison is the result of dividing the comparing criteria's weights (Rezaei 2015):

$$
P_{(B,j)} = w_B/w_j \quad \forall j \quad (5.11)
$$

$$
P_{(j,W)} = w_j/w_W \quad \forall j \quad (5.12)
$$

in which $w_i, w_j, w_B$, and $w_W$ = the weights that are assigned to the $i$th, $j$th, the best, and the worst criteria, respectively. Notice the summation of assigned weights is equal to 1 (Rezaei 2015).
Ideally, if the decision-makers judgments are fully consistent, a single, elegant solution (set of weights) could be found that satisfy all the aforementioned conditions implied by Eqs. (5.11, 5.12). The BWM searches for a set of arrays of weights, say $(w_1, w_2, \dots, w_n)$, where $w_j$ is the optimized assigned weight for the $j$th criterion that would cause the least amount of inconsistency. The aforementioned notion can be mathematically expressed as a minimax problem, as follows (Rezaei 2015):

$$
\text{Min Max} \left\{ \left| \frac{w_B}{w_j} - P_{(B,j)} \right|, \left| \frac{w_j}{w_W} - P_{(j,W)} \right| \right\}
$$

$$
\text{Subject to}
$$

$$
\sum_{j=1}^{n} w_j = 1
$$

$$
w_j \ge 0 \quad \forall j \quad (5.13)
$$

The above minimax problem can be described as the following linear programming problem (Rezaei 2015):

$$
\text{Min } \xi
$$

$$
\text{Subject to}
$$

$$
\left| \frac{w_B}{w_j} - P_{(B,j)} \right| \le \xi
$$

$$
\left| \frac{w_j}{w_W} - P_{(j,W)} \right| \le \xi
$$

$$
\sum_{j=1}^{n} w_j = 1
$$

$$
w_j \ge 0 \quad \forall j \quad (5.14)
$$

66
# 5 The Best-Worst Method (BWM)

in which $\xi$ = the maximum absolute difference of estimated values of the pairwise comparisons with their computed values. It goes without saying that the smaller values for $\xi$ indicate a more consistent judgment by the decision-maker. Also, note that in the off chance that the decision-maker makes fully consistent comparisons $\xi$ would be equal to zero. Eventually, solving the described problem in Eq. (5.14) would reveal the optimal solution which is a set of arrays $(w_1^*, w_2^*, \dots, w_n^*)$, and, resultantly, $\xi$ can be obtained. It is worth mentioning that, although the BWM is essentially designed to estimate the weights of criteria in an MADM problem, the explained process could be modified to obtain the value of alternatives with respect to each given criterion.

### 5.3.5 Step 5: Measuring the Inconsistency of Decision-Makers Judgments
MADM methods that are pairwise comparison-oriented may suffer from the logical inconsistencies that are rooted in the decision-makers inaccurate judgments. Consequently, the final step of the decision-making process ought to be the logical evaluation of the assessments made by the decision-maker. As a pairwise comparison-based method, the BWM also requires an inaccuracy measurement procedure through which the accuracy of the decision-making process is checked. To that end, Rezaei (2015) proposed a novel approach to measure the inconsistencies that was altered specifically for the unique characteristic of the BWM.
Given the features of the BWM a comparison is fully consistent, if and only if, the following condition holds (Rezaei 2015):

$$
P_{(B,i)} \times P_{(i,W)} = P_{(B,W)} \quad \forall j \quad (5.15)
$$

in which $P_{(B,W)}$ = the preference of the best criterion over the worst criterion. Notice for each given $P_{(B,W)}$ the following statement applies (Rezaei 2015):

$$
P_{(i,j)} \in \{1, 2, \dots, P_{(B,W)}\} \quad (5.16)
$$

According to Eq. (5.15), the largest error $\xi$ would occurs if $P_{(B,j)} = P_{(j,W)} = P_{(B,W)}$. In such circumstances, based on Eq. (5.14), the decision-maker's absolute error in judgment would be, say $\xi^*$. This indicates that the decision-maker has overestimated both $P_{(B,j)}$ and $P_{(j,W)}$, and underestimated $P_{(B,W)}$ by $\xi^*$. Consequently, the following equation can be obtained (Rezaei 2015):

$$
[P_{(B,j)} - \xi^*] \times [P_{(j,W)} - \xi^*] = [P_{(B,W)} + \xi^*] \quad (5.17)
$$

Given that $P_{(B,j)} = P_{(j,W)} = P_{(B,W)}$, Eq. (5.17) can be rearranged as follows (Rezaei 2015):

$$
(\xi^*)^2 - [1 + 2P_{(B,W)}] \times \xi^* + [P_{(B,W)}]^2 - P_{(B,W)} = 0 \quad (5.18)
$$

67
References

**Table 5.2** The inconsistency index ($\xi^*$) of 1–9 scale.

| $P_{(B,W)}$ | 1    | 2    | 3    | 4    | 5    | 6    | 7    | 8    | 9    |
| :---------- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| $\xi^*$     | 0.00 | 0.44 | 1.00 | 1.63 | 2.30 | 3.00 | 3.73 | 4.47 | 5.23 |

Equation (5.18) allows the decision-maker to compute $\xi^*$ or the inconsistency index, which is the largest error that can be made through the decision-making process via the BWM. Rezaei (2015) solved the aforementioned problem for a pairwise comparison that has been made on a 1–9 scale. The results are summarized in Table 5.2.
Lastly, the BWM inconsistency ratio (BIR) is computed as follows (Rezaei 2015):

$$
BIR = \frac{\xi}{\xi^*} \quad (5.19)
$$

It goes without saying that the more consistent the pairwise comparisons are, the smaller the calculated BIRs can be. Naturally, if the computed BIR is to be considered negligible by the decision-maker, the results of the BWM are logically validated. Finally, the logically validated set of computed weights $(w_1^*, w_2^*, \dots, w_n^*)$ is used to aggregate the overall preference of alternatives (Eq. (5.2)). The BWM was originally designed to evaluate and assign the proper weights to the decision-making's criteria set. Yet, the entire process can be altered to score the alternatives' values with respect to each criterion $[v_{(i,j)}]$.

## 5.4 Conclusion
This chapter was dedicated to the BWM, a compensatory, pairwise comparison-oriented MADM method, that reflects the decision-maker's preferences through an alternative/criterion weighting mechanism which aggregates the alternatives' values so that the most suitable alternative emerge as the solution to the MADM problem at hand. A solid logical background and the relative ease of use makes the BWM a primary candidate to cope with real-world MADM problems.

## References
Ahmad, W.N.K.W., Rezaei, J., Sadaghiani, S., and Tavasszy, L.A. (2017). Evaluation of the external forces affecting the sustainability of oil and gas supply chain using best worst method. *Journal of Cleaner Production* 153: 242–252.

68
# 5 The Best-Worst Method (BWM)

Annema, J.A., Mouter, N., and Razaei, J. (2015). Cost-benefit analysis (CBA), or multi-criteria decision-making (MCDM) or both: politicians' perspective in transport policy appraisal. *Transportation Research Procedia* 10: 788–797.
Banihabib, M.E., Hashemi-Madani, F.S., and Forghani, A. (2017). Comparison of compensatory and non-compensatory multi criteria decision making models in water resources strategic management. *Water Resources Management* 31 (12): 3745–3759.
Chang, Y.H. and Yeh, C.H. (2001). Evaluating airline competitiveness using multiattribute decision making. *Omega* 29 (5): 405–415.
Chitsaz, N. and Azarnivand, A. (2017). Water scarcity management in arid regions based on an extended multiple criteria technique. *Water Resources Management* 31 (1): 233–250.
Churchman, C.W. and Ackoff, R.L. (1954). An approximate measure of value. *Journal of the Operations Research Society of America* 2 (2): 172–187.
Dyer, J.S. (1990). Remarks on the analytic hierarchy process. *Management Science* 36 (3): 249–258.
Guo, S. and Zhao, H. (2017). Fuzzy best-worst multi-criteria decision-making method and its applications. *Knowledge-Based Systems* 121: 23–31.
Gupta, H. and Barua, M.K. (2016). Identifying enablers of technological innovation for Indian MSMEs using best-worst multi criteria decision making method. *Technological Forecasting and Social Change* 107: 69–79.
Gupta, H. and Barua, M.K. (2017). Supplier selection among SMEs on the basis of their green innovation ability using BWM and fuzzy TOPSIS. *Journal of Cleaner Production* 152: 242–258.
Hafezalkotob, A. and Hafezalkotob, A. (2017). A novel approach for combination of individual and group decisions based on fuzzy best-worst method. *Applied Soft Computing* 59: 316–325.
Herman, M.W. and Koczkodaj, W.W. (1996). A Monte Carlo study of pairwise comparison. *Information Processing Letters* 57 (1): 25–29.
Jeffreys, I. (2004). The use of compensatory and non-compensatory multi-criteria analysis for small-scale forestry. *Small-scale Forest Economics, Management and Policy* 3 (1): 99–117.
Ma, J., Fan, Z.P., and Huang, L.H. (1999). A subjective and objective integrated approach to determine attribute weights. *European Journal of Operational Research* 112 (2): 397–404.
Mou, Q., Xu, Z., and Liao, H. (2016). An intuitionistic fuzzy multiplicative best-worst method for multi-criteria group decision making. *Information Sciences* 374: 224–239.
Pamučar, D., Petrović, I., and Ćirović, G. (2017). Modification of the best-worst and MABAC methods: a novel approach based on interval-valued fuzzy-rough numbers. *Expert Systems with Applications* 91: 89–106.

69
References

Ren, J., Liang, H., and Chan, F.T. (2017). Urban sewage sludge, sustainability, and transition for Eco-City: multi-criteria sustainability assessment of technologies based on best-worst method. *Technological Forecasting and Social Change* 116: 29–39.
Rezaei, J. (2015). Best-worst multi-criteria decision-making method. *Omega* 53: 49–57.
Rezaei, J. (2016). Best-worst multi-criteria decision-making method: some properties and a linear model. *Omega* 64: 126–130.
Rezaei, J., Wang, J., and Tavasszy, L. (2015). Linking supplier development to supplier segmentation using best-worst method. *Expert Systems with Applications* 42 (23): 9152–9164.
Rezaei, J., Nispeling, T., Sarkis, J., and Tavasszy, L. (2016). A supplier selection life cycle approach integrating traditional and environmental criteria using the best-worst method. *Journal of Cleaner Production* 135: 577–588.
Rezaei, J., Hemmes, A., and Tavasszy, L. (2017). Multi-criteria decision-making for complex bundling configurations in surface transportation of air freight. *Journal of Air Transport Management* 61: 95–105.
Saaty, T.L. (1977). A scaling method for priorities in hierarchical structures. *Journal of Mathematical Psychology* 15 (3): 234–281.
Saaty, T.L. (1980). *The Analytic Hierarchy Process*. New York, NY: McGraw-Hill Education.
Saaty, T.L. (1985). Decision making for leaders. *IEEE Transactions on Systems, Man, and Cybernetics* 3: 450–452.
Saaty, T.L. (1986). Axiomatic foundation of the analytic hierarchy process. *Management Science* 32 (7): 841–855.
Saaty, T.L. (1988). What is the analytic hierarchy process? In: *Mathematical Models for Decision Support* (eds. G. Mitra, H.J. Greenberg, F.A. Lootsma, et al.), 109–121. Berlin: Springer.
Saaty, T.L. (1990). How to make a decision: the analytic hierarchy process. *European Journal of Operational Research* 48 (1): 9–26.
Saaty, T.L. (1994). Highlights and critical points in the theory and application of the analytic hierarchy process. *European Journal of Operational Research* 74 (3): 426–447.
Saaty, T.L. (1996). *Decision Making with Dependence and Feedback: The Analytic Network Process*. Pittsburgh, PA: RWS Publications.
Saaty, T.L. (2004). Fundamentals of the analytic network process: dependence and feedback in decision-making with a single network. *Journal of Systems Science and Systems Engineering* 13 (2): 129–157.
Saaty, T.L. (2005). *Theory and Applications of the Analytic Network Process: Decision Making with Benefits, Opportunities, Costs, and Risks*. Pittsburgh, PA: RWS Publications.

70
# 5 The Best-Worst Method (BWM)

Saaty, T.L. (2006). The analytic network process. In: *Decision Making with the Analytic Network Process* (eds. T.L. Saaty and L.G. Vargas), 1–26. Boston, MA: Springer.
Saaty, T.L. (2008). Decision making with the analytic hierarchy process. *International Journal of Services Sciences* 1 (1): 83–98.
Saaty, T.L. and Vargas, L. (2006). *Decision Making with the Analytic Network Process: Economics, Political, Social and Technological Applications with Benefits, Opportunities, Costs, and Risks*. New York, NY: Springer.
Salimi, N. and Rezaei, J. (2016). Measuring efficiency of university-industry Ph.D. projects using best-worst method. *Scientometrics* 109 (3): 1911–1938.
Thurstone, L.L. (1927). A law of comparative judgment. *Psychological Review* 34 (4): 273–286.
Torabi, S.A., Giahi, R., and Sahebjamnia, N. (2016). An enhanced risk assessment framework for business continuity management systems. *Safety Science* 89: 201–218.
Yang, Q., Zhang, Z., You, X., and Chen, T. (2016). Evaluation and classification of overseas talents in China based on the BWM for intuitionistic relations. *Symmetry* 8 (11): 137.
Yu, P.L. (1990). *Forming Winning Strategies: An Integrated Theory of Habitual Domains*. Heidelberg, Germany: Springer Science and Business Media Publication.

WILEY
To purchase this product, please visit https://www.wiley.com/en-us/9781119563495

[Figure: Cover of the book 'A Handbook on Multi-Attribute Decision-Making Methods' by Omid Bozorg-Haddad, Babak Zolghadr-Asli, Hugo A. Loáiciga, published by Wiley.]

A Handbook on Multi-Attribute Decision-Making Methods
Omid Bozorg-Haddad, Babak Zolghadr-Asli, Hugo A. Loáiciga

|             |             |             |             |
| :---------- | :---------- | :---------- | :---------- |
| E-Book      | 978-1-119-56347-1 | March 2021  | $100.00     |
| Hardcover   | 978-1-119-56349-5 | May 2021    | Pre-order   | $125.00     |
| O-Book      | 978-1-119-56350-1 | March 2021  | Available on Wiley Online Library |

## DESCRIPTION
Clear and effective instruction on MADM methods for students, researchers, and practitioners.

A Handbook on Multi-Attribute Decision-Making Methods describes multi-attribute decision-making (MADM) methods and provides step-by-step guidelines for applying them. The authors describe the most important MADM methods and provide an assessment of their performance in solving problems across disciplines. After offering an overview of decision-making and its fundamental concepts, this book covers 20 leading MADM methods and contains an appendix on weight assignment methods. Chapters are arranged with optimal learning in mind, so you can easily engage with the content found in each chapter. Dedicated readers may go through the entire book to gain a deep understanding of MADM methods and their theoretical foundation, and others may choose to review only specific chapters. Each standalone chapter contains a brief description of prerequisite materials, methods, and mathematical concepts needed to cover its content, so you will not face any difficulty understanding single chapters. Each chapter:
* Describes, step-by-step, a specific MADM method, or in some cases a family of methods
* Contains a thorough literature review for each MADM method, supported with numerous examples of the method's implementation in various fields
* Provides a detailed yet concise description of each method's theoretical foundation
* Maps each method's philosophical basis to its corresponding mathematical framework

* Demonstrates how to implement each MADM method to real-world problems in a variety of disciplines

In MADM methods, stakeholders' objectives are expressible through a set of often conflicting criteria, making this family of decision-making approaches relevant to a wide range of situations. A Handbook on Multi-Attribute Decision-Making Methods compiles and explains the most important methodologies in a clear and systematic manner, perfect for students and professionals whose work involves operations research and decision making.

## ABOUT THE AUTHOR
**Omid Bozorg-Haddad**, PhD, is Professor in the Department of Irrigation & Reclamation Engineering at University of Tehran, Iran. Dr. Bozorg-Haddad is co-author of *Meta-heuristic and Evolutionary Algorithms for Engineering Optimization* (Wiley, 2017).

**Babak Zolghadr-Asli**, M.Sc., received M.Sc. in Irrigation Engineering, Water Resources Management, from Tehran University in Tehran, Iran. Dr. Aolghadr-Asli is a member of American Society of Civil Engineers (ASCE) and International Association of Hydrological Science (IAHS).

**Hugo A. Loaiciga**, PhD, is Professor of Geography in the Department of Geography at the University of California, Santa Barbara, CA, USA. Dr. Loaiciga is co-author of *Meta-heuristic and Evolutionary Algorithms for Engineering Optimization* (Wiley, 2017).

## SERIES
Wiley Series in Operations Research and Management Science

To purchase this product, please visit https://www.wiley.com/en-us/9781119563495